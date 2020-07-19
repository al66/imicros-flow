/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { v4: uuid } = require("uuid");
//const _ = require("lodash");
const _ = require("./util/lodash");
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
                offset: { type: "string" },
                event: { type: "string" },
                payload: { type: "object" },
                version: { type: "string" },
                uid: { type: "string" },
                timestamp: { type: "number" }
            },
            async handler(ctx) {
                let flow = _.get(ctx.meta,"flow",{});

                let params = {
                    // event
                    name: ctx.params.event,
                    version: ctx.params.version,
                    id: ctx.params.uid,
                    processId: flow.processId,
                    elementId: flow.elementId,
                    instanceId: flow.instanceId
                };

                let options = {
                    meta: ctx.meta
                };
                if (!options.meta.ownerId) options.meta.ownerId = "CORE"; 
                let subscriptions = await this.broker.call(this.services.query + ".subscriptions", params, options);
                this.logger.debug(`Subscritions for received event ${params.id}`, {
                    event: params,
                    meta: options.meta,
                    subscriptions: subscriptions
                });
                
                // Loop at subscriptions and trigger events
                let events = [];
                if (Array.isArray(subscriptions)) {
                    for (let i = 0; i < subscriptions.length; i++) {
                        let subscription = subscriptions[i];
                        this.logger.debug("Start trigger subscription", { subscription: subscription });
                        try {

                            // request access for group
                            let ownerId = subscription.ownerId;
                            try {
                                // will set ctx.meta.acl
                                await this.requestAccess({ ctx: ctx, forGroupId: ownerId });
                            } catch (err) {
                                // ignore event
                                this.logger.info("Event ignored - missing authorization", { event: ctx.params.event, offset: ctx.params.offset, ownerId: ownerId });
                                return true;
                            }
                            
                            // new instance ?
                            let instanceId = ( subscription.processId === flow.processId ? flow.instanceId : null );
                            if (!instanceId) {
                                instanceId = uuid();
                                ctx.emit("instance.created", { ownerId: ownerId, processId: subscription.processId, instanceId: instanceId });
                            }

                            // save payload to context
                            let contextKey = _.get(subscription,"attributes.contextKey",subscription.elementId);
                            let params = {
                                instanceId: instanceId,
                                key: contextKey,
                                value: { 
                                    payload: ctx.params.payload,
                                    meta: _.omit(ctx.meta, ["acl","auth","token","accessToken","serviceToken"])  // clean up meta
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
                                    ownerId: ownerId
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
                this.logger.info(`${events.length} events pushed to queue "events"`, {
                    event: ctx.params
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
        
        async requestAccess({ ctx, forGroupId }) {
            let params = {
                forGroupId: forGroupId
            };
            let options = {
                meta: ctx.meta
            };
            options.meta.serviceToken = this.serviceToken;
            try {
                let res = await this.broker.call(this.services.acl + ".requestAccess", params, options);
                if (!res || !res.token) {
                    this.logger.debug("Failed to retrieve access token", { forGroupId: forGroupId });
                    throw new Error("Failed to retrieve access token");
                }
                ctx.meta = _.set(ctx.meta,"acl.accessToken",res.token);
            } catch (err) {
                this.logger.info("Failed to retrieve access token", { forGroupId: forGroupId, err: err, meta: ctx.meta });
                throw err;
            }
            return true;
        }
        
    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        this.services = {
            query:  _.get(this.settings,"services.query","flow.query"),
            context:  _.get(this.settings,"services.context","flow.context"),
            token:  _.get(this.settings,"services.token","flow.token"),
            acl:  _.get(this.settings,"services.acl","acl")
        };
        
        this.serviceToken = process.env.SERVICE_TOKEN;
        
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