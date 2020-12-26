/**
 * @license MIT, imicros.de (c) 2020 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");
const Base = require("./base");
const _ = require("./util/lodash");

/** Events **/
// flow.activity.* { token } => true

module.exports = {
    name: "flow.activity",
    
    mixins: [Base],
    
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
    actions: {
        
        activated: {
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
            async handler(ctx) {
                await this.prepareActivity({ token: ctx.params.token });
                // this.handle({ token: ctx.params.token });
                return true;
            }
        },
        
        ready: {
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
            async handler(ctx) {
                await this.startActivity({ token: ctx.params.token });
                // this.handle({ token: ctx.params.token });
                return true;
            }
        }
        
    },

    /**
     * Events
     */
    events: { },

    /**
     * Methods
     */
    methods: {
        
        async prepareActivity({ token }) {
            // prepare activity
            let activity = await this.getElement({ token });
            this.logger.debug("prepare activity", {activity, token});
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
            this.logger.info("start activity", { activity, token });
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
                    if (keys && !Array.isArray(keys)) keys = keys.split(",");
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
                    if (keys && !Array.isArray(keys)) keys = keys.split(",");
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
        }
                
    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
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