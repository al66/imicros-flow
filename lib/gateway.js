/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");
const _ = require("./util/lodash");

/** Events **/
// flow.gateway.* { token } => { true }

module.exports = {
    name: "flow.gateway",
    
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
        "flow.gateway.*": {
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
            }
        }
    },

    /**
     * Methods
     */
    methods: {
        handle({ token }) {
            switch ( token.status ) {
                case Constants.GATEWAY_ACTIVATED:
                    this.activateGateway({ token });
                    break;
                default:
                    /* istanbul ignore next */
                    this.logger.error("Unknown token status", { token });
            }            
        },
        
        async activateGateway({ token }) {
            switch ( token.type ) {
                // exclusive gateway - flow control by outgoing sequences
                case Constants.EXCLUSIVE_GATEWAY:
                    {
                        // pass through, emit gateway completed token
                        this.completeGateway({ token });
                    }
                    break;
                // parallel gateway - check completion status
                case Constants.PARALLEL_GATEWAY:
                    {
                        // save received token
                        await this.saveToken({ token });
                        
                        // evaluate: all incoming sequences complete ?
                        let result = await this.evaluateParallelGateway({ token });
                        
                        if (result === true) {
                            
                            // is complete, emit gateway completed token
                            this.completeGateway({ token });
                            
                        } else {
                            
                            // otherwise wait, do nothing
                            this.broker.emit("flow.token.consume", { token });
                            
                        }
                    }
                    break;
                // event based gateway - following catching events or catching tasks must call back to check the status
                case Constants.EVENT_BASED_GATEWAY:
                    {
                        // add attribute for following catching event or catching task (callback)
                        let callback = _.cloneDeep(token);
                        _.set(callback,"attributes.callback.event", "flow.gateway.eventBased.callback");
                        _.set(callback,"attributes.callback.elementId", token.elementId);
                        
                        // emit gateway completed token with callback
                        callback.status = Constants.GATEWAY_COMPLETED;
                        this.broker.emit("flow.token.consume", { token });
                        this.broker.emit("flow.token.emit", { token: callback });
                    }
                    break;
                case Constants.INCLUSIVE_GATEWAY:
                    break;
                case Constants.EXCLUSIVE_EVENT_BASED_GATEWAY:
                    break;
                case Constants.PARALLEL_EVENT_BASED_GATEWAY:
                    break;
            }
        },

        async saveToken({ token }) {
            let params = {
                processId: token.processId,
                instanceId: token.instanceId,
                elementId: token.elementId,
                token
            };
            await this.broker.call(this.services.store + ".saveToken", params);
        },
                
        async evaluateParallelGateway({ token }) {
            // get stored token
            let stored = await this.getToken({ token });
            
            // get incoming sequences
            let incoming = await this.getIncoming({ token });
            
            // check if incoming sequences are complete
            let received = [];
            for (let sequence of incoming) {
                for (let token of stored) {
                    // received token from this incoming sequence
                    if (token.attributes && token.attributes.lastElementId === sequence.uid) {
                        received.push(sequence.uid);
                        break;
                    } 
                }
            }
            return received.length === incoming.length ? true : false;
        },
        
        async getToken({ token }) {
            let params = {
                processId: token.processId,
                instanceId: token.instanceId,
                elementId: token.elementId
            };
            let result = await this.broker.call(this.services.store + ".getToken", params);
            if (result && result.last === token && result.token && result.token.length ) return result.token;
            // empty array, if our token was not the last one saved or result is not as expected
            return [];
        },
        
        completeGateway({ token }) {
            let completed = Object.assign({},token);
            completed.status = Constants.GATEWAY_COMPLETED;
            this.broker.emit("flow.token.consume", { token });
            this.broker.emit("flow.token.emit", { token: completed });
        },
        
        async getIncoming({ token, opts = {} }) {
            if (!opts.meta) opts.meta = await this.getMeta({ token: token });
            try {
                let result = await this.broker.call(this.services.query + ".previous", { processId: token.processId, elementId: token.elementId }, opts);
                this.logger.info("getIncoming", { result });
                if (result && result.length) return result;
            } catch (err) {
                this.logger.error("Failed to retrieve details of element", { token });
            }
            return [];
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
            query: _.get(this.settings,"services.query","flow.query"),
            store: _.get(this.settings,"services.store","flow.store"),
            acl: _.get(this.settings,"services.acl","acl")
            // context: _.get(this.settings,"services.context","flow.context"),
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