/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");
const Base = require("./base");
const _ = require("./util/lodash");

/** Events **/
// flow.gateway.* { token } => { true }

module.exports = {
    name: "flow.gateway",
    
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
                await this.activateGateway({ token: ctx.params.token });
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
        
        async activateGateway({ token }) {
            switch ( token.type ) {
                case Constants.EXCLUSIVE_GATEWAY:
                    // incoming - pass through 
                    // outgoing - flow control by outgoing sequences
                    await this.completeGateway({ token });
                    break;
                case Constants.PARALLEL_GATEWAY:
                    // incoming - check completion status
                    // outgoing - pass through
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
                case Constants.EVENT_BASED_GATEWAY:
                    // incoming - pass through 
                    // outgoing - following catching events or catching tasks must call back to check the status
                    await this.completeGateway({ token });
                    break;
                case Constants.INCLUSIVE_GATEWAY:
                    break;
                case Constants.EXCLUSIVE_EVENT_BASED_GATEWAY:
                    break;
                case Constants.PARALLEL_EVENT_BASED_GATEWAY:
                    break;
            }
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
        
        completeGateway({ token }) {
            // build new token
            let newToken = _.cloneDeep(token);
            newToken.status = Constants.GATEWAY_COMPLETED;
            
            // set attributes for handling by follwing elements
            switch ( token.type ) {
                case Constants.EXCLUSIVE_GATEWAY:
                    _.set(newToken, "attributes.exclusiveGateway", true);
                    break;
                case Constants.EVENT_BASED_GATEWAY:
                    // add attribute for following catching event or catching task (callback)
                    _.set(newToken,"attributes.callback.event", "flow.gateway.eventBased.callback");
                    _.set(newToken,"attributes.callback.elementId", token.elementId);
                    break;
            }
            
            // consume received token and emit new token
            this.broker.emit("flow.token.consume", { token });
            this.broker.emit("flow.token.emit", { token: newToken });
        },
        
        async saveToken({ token }) {
            let params = {
                processId: token.processId,
                instanceId: token.instanceId,
                elementId: token.elementId,
                token
            };
            await this.broker.call(this.services.context + ".saveToken", params);
        },
                
        async getToken({ token }) {
            let params = {
                processId: token.processId,
                instanceId: token.instanceId,
                elementId: token.elementId
            };
            let result = await this.broker.call(this.services.context + ".getToken", params);
            if (result && result.last === token && result.token && result.token.length ) return result.token;
            // empty array, if our token was not the last one saved or result is not as expected
            return [];
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
        }
        
    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        this.services = {
            query: _.get(this.settings,"services.query","flow.query"),
            acl: _.get(this.settings,"services.acl","acl"),
            context: _.get(this.settings,"services.context","flow.context"),
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