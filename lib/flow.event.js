/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { v4: uuid } = require("uuid");
const _ = require("lodash");
const { Constants } = require("imicros-flow-control");

/** Actions */
// action handle { event } => { number of subscriptions }

module.exports = {
    name: "flow.event",
    
    /**
     * Service settings
     */
    settings: {
        /*
        services: {
            query: "flow.query",
            context: "flow.context"
            token: "flow.token"
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
    //dependencies: ["flow.queue"],	

    /**
     * Actions
     */
    actions: {

        /**
         * handle event
         * 
         * @actions
         * @param {Object} event
         * @param {Object} payload
         * 
         * @returns {Integer} number of subscriptions
         */
        handle: {
            params: {
                event: { type: "string" },
                payload: { type: "object" }
            },
            async handler(ctx) {
                let flow = _.get(ctx.meta,"flow",{});

                let params = {
                    // event
                    name: ctx.params.event,
                    version: _.get(ctx.meta,"event.version",null),
                    id: _.get(ctx.meta,"event.id",null),
                    processId: flow.processId,
                    elementId: flow.elementId,
                    instanceId: flow.instanceId
                };
                let options = {
                    meta: ctx.meta
                };
                let subscriptions = await this.broker.call(this.services.query + ".subscriptions", params, options);
                this.logger.debug(`Subscritions for received event ${params.id}`, {
                    event: ctx.params.event.name,
                    subscriptions: subscriptions
                });
                
                // Loop at subscriptions and trigger events
                let events = [];
                if (Array.isArray(subscriptions)) {
                    for (let i = 0; i < subscriptions.length; i++) {
                        let subscription = subscriptions[i];
                        this.logger.debug("Start trigger subscription", { subscription: subscription });
                        try {
                            // save payload to context
                            let instanceId = ( subscription.processId === flow.processId ? flow.instanceId : uuid() );

                            // get acl exchange token for later accesses
                            let exchangeToken = await this.getExchangeToken({
                                accessToken: _.get(ctx.meta,"acl.accessToken",null),
                                processId: subscription.processId,
                                instanceId: instanceId
                            });

                            let params = {
                                instanceId: instanceId,
                                key: subscription.elementId,
                                value: { 
                                    payload: ctx.params.payload,
                                    meta: ctx.meta
                                }
                            };
                            await this.broker.call(this.services.context + ".add", params, options);

                            // emit token
                            params = {
                                instanceId: instanceId,
                                // token
                                emit: [{
                                    processId: subscription.processId,
                                    instanceId: instanceId,
                                    elementId: subscription.elementId,
                                    type: subscription.type,
                                    status: Constants.EVENT_ACTIVATED,
                                    user: ctx.meta.user,
                                    accessToken: exchangeToken
                                }]
                            };
                            await this.broker.call(this.services.token+ ".update", params, options);

                            // for debugging
                            events.push(subscription);
                            
                        } catch (err) {
                            this.logger.error("Subscription failed", { subscription: subscription, err: err });
                        }
                    }
                }
                
                // return number of found subscriptions
                this.logger.debug(`${events.length} events pushed to queue "events"`, {
                    event: params.event
                });
                
                return events.length;
                
            }
        }
        
    },

    /**
     * Events
     */
    events: {},

    /**
     * Methods
     */
    methods: {
        
        async getExchangeToken({ accessToken, processId, instanceId }) {
            let exchangeToken;
            let params = {
                accessToken: accessToken,
                processId: processId,
                instanceId: instanceId
            };
            let options = {
                meta: {}
            };
            try {
                exchangeToken = await this.broker.call(this.services.token + ".getExchangeToken", params, options);
            } catch (err) {
                this.logger.debug("Failed to retrieve exchange token", { accessToken: accessToken });
            }
            return exchangeToken;
        }
        
    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        this.services = {
            query:  _.get(this.settings,"services.query","flow.query"),
            context:  _.get(this.settings,"services.context","flow.context"),
            token:  _.get(this.settings,"services.token","flow.token")
        };
        
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