/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");
const _ = require("./util/lodash");

/** Events **/
// flow.sequence.* { token } => true

module.exports = {
    name: "flow.sequence",
    
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
        "flow.sequence.activated": {
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
                this.handleActivated({ token: ctx.params.token });
            }
        },

        "flow.sequence.evaluated": {
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
                this.handleEvaluated({ token: ctx.params.token });
            }
        }
    },

    /**
     * Methods
     */
    methods: {
        handleActivated({ token }) {
            switch ( token.status ) {
                case Constants.SEQUENCE_ACTIVATED:
                    this.evaluateSequence({ token });
                    break;
                default:
                    this.logger.error("Unknown token status", { token });
            }            
        },
        
        async evaluateSequence({ token }) {

            switch ( token.type ) {
                // start
                case Constants.SEQUENCE_STANDARD:
                    {
                        // pass through, emit event occured token
                        let completed = Object.assign({},token);
                        completed.status = Constants.SEQUENCE_COMPLETED;
                        this.broker.emit("flow.token.consume", { token });
                        this.broker.emit("flow.token.emit", { token: completed });
                    }
                    break;
                case Constants.SEQUENCE_DEFAULT:
                    break;
                case Constants.SEQUENCE_CONDITIONAL:
                    {
                        let opts = {
                            meta: await this.getMeta({ token: token })
                        };
                        let sequence = await this.getElement({ token, opts });
                        // evaluate ruleset
                        let ruleset = _.get(sequence,"attributes.ruleset",null);
                        this.logger.info("execute business rule", { ruleset });
                        if (ruleset) {
                            try {
                                let keys = _.get(sequence,"attributes.contextKeys",[]);
                                // get context
                                let context = await this.broker.call(this.services.context + ".getKeys", { instanceId: token.instanceId, keys: keys }, opts);
                                // evaluate
                                let result = await this.broker.call(this.services.rules + ".eval", { name: ruleset, data: context || {} }, opts);
                                let resultKey = _.get(sequence,"attributes.resultKey","result");
                                // dependent on result: complete or reject
                                if (result && result[resultKey] === true) {
                                    // if result emit completed token
                                    let completed = _.cloneDeep(token);
                                    completed.status = Constants.SEQUENCE_COMPLETED;
                                    if (completed.attributes && completed.attributes.defaultSequence) {
                                        this.logger.debug("sequence evaluated", { token: completed });
                                        let notify = await _.cloneDeep(completed);
                                        this.broker.emit("flow.sequence.evaluated", { token: notify });
                                        delete completed.attributes.defaultSequence;
                                        delete completed.attributes.waitFor;
                                    }
                                    this.broker.emit("flow.token.consume", { token });
                                    this.broker.emit("flow.token.emit", { token: completed });
                                } else {
                                    // if result emit rejected token
                                    let rejected = _.cloneDeep(token);
                                    rejected.status = Constants.SEQUENCE_REJECTED;
                                    if (rejected.attributes && rejected.attributes.defaultSequence) {
                                        this.logger.debug("sequence evaluated", { token: rejected });
                                        let notify = await _.cloneDeep(rejected);
                                        this.broker.emit("flow.sequence.evaluated", { token: notify });
                                        delete rejected.attributes.defaultSequence;
                                        delete rejected.attributes.waitFor;
                                    }
                                    this.broker.emit("flow.token.consume", { token });
                                    this.broker.emit("flow.token.emit", { token: rejected });
                                }
                            } catch (err) {
                                this.logger.debug("Execution of rule task failed", { error: err });
                                // console.log(err);
                                let failed = _.cloneDeep(token);
                                failed.status = Constants.SEQUENCE_ERROR;
                                this.broker.emit("flow.token.consume", { token });
                                this.broker.emit("flow.token.emit", { token: failed });
                            }

                        }
                    }
                    break;
            }
        },
        
        async handleEvaluated({ token }) {
            if (!token.attributes || !token.attributes.defaultSequence || !token.attributes.waitFor ) {
                this.logger.warn("handleEvaluated - unvalid token", { token });
                return;
            }
            // save result in status for element sequence default
            let params = { 
                processId: token.processId, 
                instanceId: token.instanceId, 
                elementId: token.attributes.defaultSequence,
                token 
            };
            let opts = {
                meta: await this.getMeta({ token })
            };
            this.logger.debug("call store.saveToken", { params });
            await this.broker.call(this.services.store + ".saveToken", params, opts);
            
            // if status rejected
            if (token.status === Constants.SEQUENCE_REJECTED) {
                // get status of element sequence default from db
                let status = await this.broker.call(this.services.store + ".getToken", { 
                    processId: token.processId, 
                    instanceId: token.instanceId, 
                    elementId: token.attributes.defaultSequence
                }, opts);
                // if last update by this token check status
                if (status && status.token && status.last === token) {
                    let received = [];
                    for (let sequenceId in token.attributes.waitFor) {
                        let result = null;
                        for (let token in status.token) {
                            if (token.elementId === sequenceId) {
                                result = token.status === Constants.SEQUENCE_REJECTED ? true : false;
                                break;
                            }
                        }
                        received.push(result);
                    }
                    // received all expected tokens?
                    if (received.length === token.attributes.waitFor.length) {
                        // one sequence not rejected? 
                        if (received.indexOf(false) >= 0) {
                            // TODO: set ttl for store item or delete store item
                            
                        } else {
                            // all other sequences rejected -> emit new token for default sequence
                            let completed = _.cloneDeep(token);
                            completed.status = Constants.SEQUENCE_COMPLETED;
                            completed.elementId = token.attributes.defaultSequence;
                            delete completed.attributes.defaultSequence;
                            delete completed.attributes.waitFor;
                            this.broker.emit("flow.token.emit", { token: completed });
                        }
                    }
                }
            }
            
        },
        
        async getElement({ token, opts = {} }) {
            let element;
            if (!opts.meta) opts.meta = await this.getMeta({ token: token });
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
                    user: token.user
                }
            };
            try {
                let res = await this.broker.call(this.services.acl + ".requestAccess", { forGroupId: token.ownerId }, opts);
                if (res && res.token) accessToken = res.token;
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
            store: _.get(this.settings,"services.store","flow.store"),
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