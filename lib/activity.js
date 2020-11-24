/**
 * @license MIT, imicros.de (c) 2020 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");
const _ = require("./util/lodash");

/** Events **/
// flow.activity.* { token } => true

module.exports = {
    name: "flow.activity",
    
    /**
     * Service settings
     */
    settings: {
        /*
        services: {
            context: "flow.context",
            query: "flow.query",
            acl: "acl",
        }
        */        
    },

    /**
     * Service metadata
     */
    metadata: {},

    /**
     * Service dependencies
     */
    //dependencies: ["flow.query","flow.context","acl"],	

    /**
     * Actions
     */
    actions: {},

    /**
     * Events
     */
    events: {
        "flow.activity.*": {
            params: {
                token: { 
                    type: "object",
                    props: {
                        processId: { type: "uuid" },
                        instanceId: { type: "uuid" },
                        elementId: { type: "uuid", optional: true },
                        type: { type: "string" },
                        status: { type: "string" },
                        user: { type: "object" },
                        ownerId: { type: "string" },
                        attributes: { type: "object", optional: true}
                    }
                }
            },
            handler(ctx) {
                this.handle({ token: ctx.params.token });
                return true;
            }
        }
    },

    /**
     * Methods
     */
    methods: {
        handle({ token }) {
            switch ( token.status ) {
                case Constants.ACTIVITY_ACTIVATED:
                    this.prepareActivity({ token });
                    break;
                case Constants.ACTIVITY_READY:
                    this.startActivity({ token });
                    break;
                default:
                    this.logger.error("Unknown token status", { token });
            }            
        },
        
        async prepareActivity({ token }) {
            // prepare activity
            let activity = await this.getElement({ token });
            switch ( activity.type ) {
                case Constants.SERVICE_TASK:
                    await this.prepareServiceTask({ token, activity });
                    break;
                default: {
                    let ready = Object.assign({},token);
                    ready.status = Constants.ACTIVITY_READY;
                    this.broker.emit("flow.token.consume", { token });
                    this.broker.emit("flow.token.emit", { token: ready });
                }
            }
        },
        
        async startActivity({ token }) {
            // start activity 
            let activity = await this.getElement({ token });
            this.logger.info("start activity", { activity: activity });
            if ( activity.type === Constants.SERVICE_TASK) {
                await this.startServiceTask({ token, activity });
            }
            if ( activity.type === Constants.BUSINESS_RULE_TASK ) {
                await this.startBusinessRuleTask({ token, activity });
            }
        },
        
        async startServiceTask({ token, activity }) {
            // execute action
            let action = _.get(activity,"attributes.action",null);
            if (action) {
                let opts = {
                    meta: await this.getMeta({ token: token })
                };
                try {
                    let paramsKey = _.get(activity,"attributes.paramsKey",".");
                    // get context
                    let params = await this.broker.call(this.services.context + ".get", { instanceId: token.instanceId, key: paramsKey }, opts);
                    let result = await this.broker.call(action, params, opts);
                    let contextKey = _.get(activity,"attributes.resultKey",token.elementId);
                    // save result to context
                    if (result) {
                        await this.broker.call(this.services.context + ".add", { instanceId: token.instanceId, key: contextKey, value: result }, opts);
                    }
                    // if executed w/o errors emit completed token
                    let completed = _.cloneDeep(token);
                    completed.status = Constants.ACTIVITY_COMPLETED;
                    this.broker.emit("flow.token.consume", { token });
                    this.broker.emit("flow.token.emit", { token: completed });
                } catch (err) {
                    this.logger.info("Execution of service task failed", { error: err });
                    let failed = _.cloneDeep(token);
                    failed.status = Constants.ACTIVITY_ERROR;
                    this.broker.emit("flow.token.emit", { token: failed });
                }
            }
        },
        
        async prepareServiceTask({ token, activity }) {
            // evaluate ruleset
            let ruleset = _.get(activity,"attributes.ruleset",null);
            this.logger.info("execute business rule", { ruleset });
            if (ruleset) {
                let opts = {
                    meta: await this.getMeta({ token: token })
                };
                try {
                    let keys = _.get(activity,"attributes.contextKeys",[]);
                    // get context
                    let context = await this.broker.call(this.services.context + ".getKeys", { instanceId: token.instanceId, keys: keys }, opts);
                    // prepare action parameters
                    let result = await this.broker.call(this.services.rules + ".eval", { name: ruleset, data: context || {} }, opts);
                    this.logger.debug("Parameter preparation in service task executed", { ruleset, context, result });
                    let contextKey = _.get(activity,"attributes.paramsKey",token.elementId);
                    // save result to context
                    if (result) {
                        await this.broker.call(this.services.context + ".add", { instanceId: token.instanceId, key: contextKey, value: result }, opts);
                    }
                    // if executed w/o errors emit completed token
                    let ready = _.cloneDeep(token);
                    ready.status = Constants.ACTIVITY_READY;
                    this.broker.emit("flow.token.consume", { token });
                    this.broker.emit("flow.token.emit", { token: ready });
                } catch (err) {
                    this.logger.debug("Execution of parameter preparation rule failed", { error: err });
                    let failed = _.cloneDeep(token);
                    failed.status = Constants.ACTIVITY_ERROR;
                    this.broker.emit("flow.token.emit", { token: failed });
                }

            } else {
                let ready = _.cloneDeep(token);
                ready.status = Constants.ACTIVITY_READY;
                this.broker.emit("flow.token.consume", { token });
                this.broker.emit("flow.token.emit", { token: ready });
            }
        },
        
        async startBusinessRuleTask({ token, activity }) {
            // evaluate ruleset
            let ruleset = _.get(activity,"attributes.ruleset",null);
            this.logger.info("execute business rule", { ruleset });
            if (ruleset) {
                let opts = {
                    meta: await this.getMeta({ token: token })
                };
                try {
                    let keys = _.get(activity,"attributes.contextKeys",[]);
                    // get context
                    let context = await this.broker.call(this.services.context + ".getKeys", { instanceId: token.instanceId, keys: keys }, opts);
                    // prepare action parameters
                    let result = await this.broker.call(this.services.rules + ".eval", { name: ruleset, data: context || {} }, opts);
                    let contextKey = _.get(activity,"attributes.contextKey",token.elementId);
                    // save result to context
                    if (result) {
                        await this.broker.call(this.services.context + ".add", { instanceId: token.instanceId, key: contextKey, value: result }, opts);
                    }
                    // if executed w/o errors emit completed token
                    let completed = _.cloneDeep(token);
                    completed.status = Constants.ACTIVITY_COMPLETED;
                    this.broker.emit("flow.token.consume", { token });
                    this.broker.emit("flow.token.emit", { token: completed });
                } catch (err) {
                    this.logger.debug("Execution of rule task failed", { error: err });
                    let failed = _.cloneDeep(token);
                    failed.status = Constants.ACTIVITY_ERROR;
                    this.broker.emit("flow.token.emit", { token: failed });
                }

            }
        },
        
        async getElement({ token }) {
            let element;
            let opts = {
                meta: await this.getMeta({ token: token })
            };
            let action;
            switch ( token.type ) {
                // event
                case Constants.DEFAULT_EVENT:
                case Constants.MESSAGE_EVENT:
                case Constants.TIMER_EVENT:
                case Constants.ESCALATION_EVENT:
                case Constants.CONDITIONAL_EVENT:
                case Constants.ERROR_EVENT:
                case Constants.CANCEL_EVENT:
                case Constants.COMPENSATION_EVENT:
                case Constants.SIGNAL_EVENT:
                case Constants.MULTIPLE_EVENT:
                case Constants.PARALLEL_MULTIPLE_EVENT:
                case Constants.TERMINATE_EVENT:
                    action = ".getEvent";
                    break;
                // task
                case Constants.SEND_TASK:
                case Constants.RECEIVE_TASK:
                case Constants.USER_TASK:
                case Constants.MANUAL_TASK:
                case Constants.BUSINESS_RULE_TASK:
                case Constants.SERVICE_TASK:
                case Constants.SCRIPT_TASK:
                    action = ".getTask";
                    break;
                // sequence
                case Constants.SEQUENCE_STANDARD:
                case Constants.SEQUENCE_CONDITIONAL:
                case Constants.SEQUENCE_DEFAULT:
                    action = ".getSequence";
                    break;
                // gateway
                case Constants.EXCLUSIVE_GATEWAY:
                case Constants.EVENT_BASED_GATEWAY:
                case Constants.PARALLEL_GATEWAY:
                case Constants.INCLUSIVE_GATEWAY:
                case Constants.EXCLUSIVE_EVENT_BASED_GATEWAY:
                case Constants.PARALLEL_EVENT_BASED_GATEWAY:
                    action = ".getGateway";
                    break;
            }
            try {
                let result = await this.broker.call(this.services.query + action, { processId: token.processId, elementId: token.elementId }, opts);
                this.logger.info("getElement", { result });
                if (result && result[0]) element = result[0];
            } catch (err) {
                this.logger.error("Failed to retrieve details of element", { token: token, action: this.services.query + action });
            }
            return element;
        },
        
        async getMeta({ token }) {
            let accessToken;
            let opts = {
                meta: {
                    serviceToken: this.serviceToken,
                    user: token.user,
                    ownerId: token.ownerId
                }
            };
            try {
                let res = await this.broker.call(this.services.acl + ".requestAccess", { forGroupId: token.ownerId }, opts);
                if (res && res.token) accessToken = res.token;
                this.logger.info("requestAccess: retrieved", { res });
            } catch (err) {
                this.logger.error("Failed to retrieve access token", { token: token });
            }
            return {
                serviceToken: this.serviceToken,
                user: token.user,
                ownerId: token.ownerId,
                acl: {
                    accessToken: accessToken
                }
            };
        }
                
    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        // token for service authentication at imicros-acl
        this.serviceToken = process.env.SERVICE_TOKEN || "unvalid";
        
        this.services = {
            context: _.get(this.settings,"services.context","flow.context"),
            query: _.get(this.settings,"services.query","flow.query"),
            acl: _.get(this.settings,"services.acl","acl"),
            rules: _.get(this.settings,"services.rules","rules")
        };

        this.broker.waitForServices(Object.values(this.services));
        
    },
    /**
     * Service started lifecycle event handler
     */
    async started() {},

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {}
    
};