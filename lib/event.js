/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");
const { v4: uuid } = require("uuid");
const _ = require("./util/lodash");

/** Events **/
// ** { any } => { true }
// flow.event.* { token } => { true }

module.exports = {
    name: "flow.event",
    
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
        "flow.event.*": {
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
        },
        
        "**": {
            handler(ctx) {
                // ignore all own events & internal events! It may not possible to subsribe to these events
                if (/^(flow\.|\$)/.test(ctx.eventName)) return true;
                this.handleSubscriptions(ctx);
            }
        }
        
    },

    /**
     * Methods
     */
    methods: {
        handle({ token }) {
            switch ( token.status ) {
                case Constants.EVENT_ACTIVATED:
                    this.handleEvent({ token });
                    break;
                default:
                    this.logger.error("Unknown token status", { token });
            }            
        },
        
        async handleEvent({ token }) {

            switch ( token.type ) {
                // start
                case Constants.DEFAULT_EVENT:
                    {
                        // pass through, emit event occured token
                        let occured = Object.assign({},token);
                        occured.status = Constants.EVENT_OCCURED;
                        this.broker.emit("flow.token.consume", { token });
                        this.broker.emit("flow.token.emit", { token: occured });
                    }
                    break;
                case Constants.MESSAGE_EVENT:
                    break;
                case Constants.TIMER_EVENT:
                    break;
                case Constants.ESCALATION_EVENT:
                    break;
                case Constants.CONDITIONAL_EVENT:
                    break;
                case Constants.ERROR_EVENT:
                    break;
                case Constants.CANCEL_EVENT:
                    break;
                case Constants.COMPENSATION_EVENT:
                    break;
                case Constants.SIGNAL_EVENT:
                    break;
                case Constants.MULTIPLE_EVENT:
                    break;
                case Constants.PARALLEL_MULTIPLE_EVENT:
                    break;
                case Constants.TERMINATE_EVENT:
                    break;
            }
        },
        
        async handleSubscriptions(ctx) {
            let flow = _.get(ctx.meta,"flow",{});

            let params = {
                // event
                name: ctx.eventName,
                version: "",
                id: "",
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
                    this.logger.debug("Start trigger subscription", { subscription });
                    try {

                        // request access for group
                        let ownerId = subscription.ownerId;
                        try {
                            // will set ctx.meta.acl
                            await this.requestAccess({ ctx, forGroupId: ownerId });
                        } catch (err) {
                            // ignore event
                            this.logger.info("Event ignored - missing authorization", { event: ctx.params.event, offset: ctx.params.offset, ownerId: ownerId });
                            return true;
                        }

                        // new instance ?
                        let instanceId = ( subscription.processId === flow.processId ? flow.instanceId : null );
                        if (!instanceId) {
                            instanceId = uuid();
                            ctx.emit("flow.instance.created", { ownerId: ownerId, processId: subscription.processId, instanceId: instanceId });
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
                        let token = {
                            processId: subscription.processId,
                            instanceId: instanceId,
                            elementId: subscription.elementId,
                            type: subscription.type,
                            status: Constants.EVENT_OCCURED,
                            user: ctx.meta.user,
                            ownerId: ownerId
                        };
                        this.broker.emit("flow.token.emit", { token });

                        // for debugging
                        events.push(subscription);

                    } catch (err) {
                        this.logger.error("Subscription failed", { subscription: subscription, err: err });
                    }
                }
            }

            // return number of found subscriptions
            this.logger.info(`subscription: ${events.length} events tiggered`, {
                event: ctx.params
            });

            return true;

        },

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
    
        // token for service authentication at imicros-acl
        this.serviceToken = process.env.SERVICE_TOKEN || "unvalid";
        
        this.services = {
            context: _.get(this.settings,"services.context","flow.context"),
            query: _.get(this.settings,"services.query","flow.query"),
            acl: _.get(this.settings,"services.acl","acl")
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