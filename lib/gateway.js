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
    actions: {},

    /**
     * Events
     */
    events: { 
    
        "flow.token.emit": {
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

        async handle({ token }) {
            switch ( token.status ) {
                case Constants.GATEWAY_ACTIVATED:
                    await this.activateGateway({ token });
                    break;
                case Constants.GATEWAY_READY:
                    // get gateway attributes and evaluate gateway
                    // if condition evaluate to true emit completed token
                    // TODO
                    break;
                case Constants.GATEWAY_COMPLETED:
                    // do nothing
                    break;
                default:
                    // ignore token
            }            
        },
        
        async activateGateway({ token }) {
            let opts = await this.getOpts({ token });
            switch ( token.type ) {
                case Constants.EXCLUSIVE_GATEWAY:
                    // incoming - pass through 
                    // outgoing - flow control by outgoing sequences
                    await this.completeGateway({ token, opts });
                    break;
                case Constants.PARALLEL_GATEWAY:
                    // incoming - check completion status
                    // outgoing - pass through
                    await this.evaluateParallelGateway({ token, opts });
                    break;
                case Constants.EVENT_BASED_GATEWAY:
                    // incoming - pass through 
                    // outgoing - following catching events or catching tasks must call back to check the status
                    await this.completeGateway({ token, opts });
                    break;
                case Constants.INCLUSIVE_GATEWAY:
                    break;
                case Constants.EXCLUSIVE_EVENT_BASED_GATEWAY:
                    break;
                case Constants.PARALLEL_EVENT_BASED_GATEWAY:
                    break;
            }
            return true;
        },

        async evaluateParallelGateway({ token, opts }) {
            // save received token
            await this.saveToken({ token, opts });
                        
            // get stored token
            let stored = await this.getToken({ token, opts });
            
            // get incoming sequences
            let incoming = await this.getIncoming({ token, opts });
            
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
            if ( received.length === incoming.length ) {

                // is complete, emit gateway completed token
                await this.completeGateway({ token, opts });

            } else {

                // otherwise wait, do nothing
                await this.consume({ token, opts });
            }
            return true;
        },
        
        async completeGateway({ token, opts }) {
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
            await this.consume({ token, opts });
            await this.emit({ token: newToken, opts });
        },
        
        async saveToken({ token, opts }) {
            let params = {
                processId: token.processId,
                instanceId: token.instanceId,
                elementId: token.elementId,
                token
            };
            await this.broker.call(this.services.context + ".saveToken", params, opts);
        },
                
        async getToken({ token, opts }) {
            let params = {
                processId: token.processId,
                instanceId: token.instanceId,
                elementId: token.elementId
            };
            let result = await this.broker.call(this.services.context + ".getToken", params, opts);
            if (result && result.last === token && result.token && result.token.length ) return result.token;
            // empty array, if our token was not the last one saved or result is not as expected
            return [];
        },
        
        async getIncoming({ token, opts }) {
            try {
                let result = await this.broker.call(this.services.query + ".previous", { processId: token.processId, elementId: token.elementId }, opts);
                this.logger.debug("getIncoming", { result });
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
    
        const { services: { agents = "agents" } = {} } = this.settings;
        this.services = {
            query: _.get(this.settings,"services.query","flow.query"),
            acl: _.get(this.settings,"services.acl","acl"),
            context: _.get(this.settings,"services.context","flow.context"),
            agents
        };

        await this.broker.waitForServices(Object.values(this.services));
        
    },
    /**
     * Service started lifecycle event handler
     */
    async started() {

        // login to agents service and retrieve token for service authentication at imicros-acl
        this.serviceId = process.env.SERVICE_ID;
        const authToken = process.env.SERVICE_AUTH_TOKEN;        
        const { serviceToken } = await this.broker.call(this.services.agents + ".login", { serviceId: this.serviceId, authToken});
        if (!serviceToken) throw new Error("failed to login service");
        this.serviceToken = serviceToken;

    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {}
    
};