/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");
const Base = require("./base");
const { v4: uuid } = require("uuid");
const parser = require("cron-parser");
const _ = require("./util/lodash");

/** Events **/
// ** { any } => { true }
// flow.event.* { token } => { true }

module.exports = {
    name: "flow.event",
    
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
                        versionId: { type: "uuid" },
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
        
        "flow.event.scheduled": {
            params: {
                token: { 
                    type: "object",
                    props: {
                        processId: { type: "uuid" },
                        versionId: { type: "uuid" },
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
                this.handleScheduled({ token: ctx.params.token });
            }
        },
        
        "flow.event.timer.init": {
            params: {
                processId: { type: "uuid" },
                id: { type: "uuid" },
                name: { type: "string" },
                position: { type: "string", optional: true },
                type: { type: "string", optional: true },
                direction: { type: "string", optional: true },
                interaction: { type: "string", optional: true },
                attributes: { type: "object", optional: true },
                ownerId: { type: "string" }
            },
            handler(ctx) {
                this.handleTimerNext({ event: ctx.params });
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
        
        async handle({ token }) {
            switch ( token.status ) {
                case Constants.EVENT_ACTIVATED:
                    await this.eventActivated({ token });
                    break;
                case Constants.EVENT_OCCURED: 
                    // do nothing
                    break;
                default:
                    // ignore event
            }            
        },        
        
        async eventActivated({ token }) {
            let opts = await this.getOpts({ token });
            
            // get event details
            let event = await this.getElement({ token, opts });

            switch ( token.type ) {
                // start
                case Constants.DEFAULT_EVENT:
                    {
                        // pass through, emit event occured token
                        let occured = Object.assign({},token);
                        occured.status = Constants.EVENT_OCCURED;
                        this.consume({ token, opts });
                        this.emit({ token: occured, opts });
                    }
                    break;
                case Constants.MESSAGE_EVENT:
                    break;
                case Constants.TIMER_EVENT:
                    await this.activateTimer({ token, event });
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
        
        async activateTimer({ token, event }) {
            this.logger.info("activate timer", { event });
            
            let time = new Date();
            let wait = _.get(event,"attributes.wait",null);
            if (wait) {
                if (wait.years) time.setFullYear(time.getUTCFullYear() + parseInt(wait.years));
                if (wait.month) time.setMonth(time.getUTCMonth() + parseInt(wait.month));
                if (wait.days) time.setDate(time.getUTCDate() + parseInt(wait.days));
                if (wait.hours) time.setHours(time.getUTCHours() + parseInt(wait.hours));
                if (wait.minutes) time.setMinutes(time.getUTCMinutes() + parseInt(wait.minutes));
                if (wait.seconds) time.setSeconds(time.getUTCSeconds() + parseInt(wait.seconds));
            }
            this.broker.emit("flow.token.consume", { token });
            this.broker.emit("flow.timer.schedule", { event: "flow.event.scheduled", time, payload: { token } } );
            
        },
        
        async handleScheduled({ token }) {

            // check for call back by event based gateway...
            let callback = _.get(token,"attributes.callback.event",null);
            if (callback && callback != "flow.gateway.eventBased.callback") {
                callback = null;
            } 
            
            // check for cyclic start event...
            let cyclic = _.get(token,"attributes.cyclic",false);
            if (cyclic) {
                this.handleTimerNext({ token });
            }
            
            switch ( token.type ) {
                case Constants.TIMER_EVENT:
                    {
                        // pass through, emit event occured token
                        let occured = Object.assign({},token);
                        // _.set(occured, "attributes.cyclic", null);
                        occured.status = Constants.EVENT_OCCURED;
                        this.broker.emit(callback || "flow.token.emit", { token: occured });
                    }
                    break;
            }

            
            
        },
        
        async handleTimerNext({ event = null, token = null }) {
            // get event
            if (!event && token) {
                event = await this.getElement({ token });
            }
            this.logger.debug("timer event schedule next", { event });
                        
            // schedule next timer event
            let cron = _.get(event,"attributes.cron",null);
            if (cron) {
                try {
                    let interval = parser.parseExpression(cron);
                    let next = interval.next();
                    if (token) {
                        this.broker.emit("flow.token.consume", { token });
                    } else {
                        // build new token to start new instance
                        token = {
                            processId: event.processId,
                            versionId: event.versionId,
                            instanceId: uuid(),
                            elementId: event.elementId,
                            type: event.type,
                            status: Constants.EVENT_OCCURED,
                            user: {},
                            ownerId: event.ownerId,
                            attributes: {
                                cyclic: true
                            }
                        };
                        this.broker.emit("flow.instance.created", { 
                            ownerId: token.ownerId, 
                            processId: token.processId, 
                            versionId: token.versionId, 
                            instanceId: token.instanceId 
                        });
                    }
                    console.log(token);
                    this.broker.emit("flow.timer.schedule", { event: "flow.event.scheduled", time: next.toDate(), payload: { token } } );
                    this.logger.debug("next execution date/time", { event, next: next.toString() });
                } catch (err) {
                    this.logger.debug("wrong cron expression", { event, cron });
                }
            }
            
        },        
        
        async handleSubscriptions(ctx) {
            let flow = _.get(ctx.meta,"flow",{});

            let ownerId = ctx.meta.ownerId || this.adminGroupId;
            let params = {
                // event
                eventName: ctx.eventName,
                ownerId,
                version: "",
                id: "",
                processId: flow.processId,
                elementId: flow.elementId,
                instanceId: flow.instanceId
            };
            let meta;
            let subscriptions;
            try {
                // if (!options.meta.ownerId) options.meta.ownerId = "CORE"; 
                this.logger.info("call subscriptions", { params });
                subscriptions = await this.broker.call(this.services.query + ".subscriptions", params);
            } catch (err) {
                this.logger.error("Failed to retrieve subscriptions", { meta, params, err });
                return false;
            }
            this.logger.debug(`Subscritions for received event ${params.id}`, {
                event: params,
                meta,
                subscriptions
            });

            // Loop at subscriptions and trigger events
            let events = [];
            if (Array.isArray(subscriptions)) {
                for (let i = 0; i < subscriptions.length; i++) {
                    let subscription = subscriptions[i];
                    this.logger.info("Start trigger subscription", { subscription });
                    try {

                        // request access for group
                        let ownerId = subscription.ownerId;
                        try {
                            // will set ctx.meta.acl
                            await this.requestAccess({ ctx, ownerId });
                        } catch (err) {
                            // ignore event
                            this.logger.info("Event ignored - missing authorization", { event: ctx.params.event, offset: ctx.params.offset, ownerId: ownerId });
                            return true;
                        }

                        // define meta
                        //TODO: Priority first... 
                      
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
                                payload: ctx.params,
                                meta: _.omit(ctx.meta, ["acl","auth","token","accessToken","serviceToken"])  // clean up meta
                            }
                        };
                        // await this.broker.call(this.services.context + ".add", params, options);
                        await this.broker.call(this.services.context + ".add", params, { meta: ctx.meta });

                        // emit token
                        let token = {
                            processId: subscription.processId,
                            versionId: subscription.versionId,
                            instanceId: instanceId,
                            elementId: subscription.elementId,
                            type: subscription.type,
                            status: Constants.EVENT_OCCURED,
                            user: ctx.meta.user,
                            ownerId: ownerId
                        };
                        await this.emit({ token, opts: { meta: ctx.meta } });

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

        async requestAccess({ ctx, ownerId }) {
            let params = {
                ownerId
            };
            let options = {
                meta: ctx.meta
            };
            options.meta.service = {
                serviceId: this.serviceId,
                serviceToken: this.serviceToken
            };
            try {
                let res = await this.broker.call(this.services.agents + ".requestAccess", params, options);
                if (!res || !res.token) {
                    this.logger.debug("Failed to retrieve access token", { ownerId });
                    throw new Error("Failed to retrieve access token");
                }
                ctx.meta = _.set(ctx.meta,"acl.accessToken",res.token);
            } catch (err) {
                this.logger.info("Failed to retrieve access token", { ownerId, err: err, meta: ctx.meta });
                throw err;
            }
            return true;
        },

        async getInternalMeta({ ownerId }) {
            let accessToken;
            let opts = {
                meta: {
                    service: {
                        serviceId: this.serviceId,
                        serviceToken: this.serviceToken
                    }
                }
            };
            try {
                this.logger.info("getInternalMeta - call agents.requestAccess", { ownerId, opts });
                let res = await this.broker.call(this.services.agents + ".requestAccess", { ownerId }, opts);
                if (res && res.token) accessToken = res.token;
            } catch (err) {
                this.logger.error("Failed to retrieve access token", { ownerId });
            }
            return {
                service: {
                    serviceId: this.serviceId,
                    serviceToken: this.serviceToken
                },
                ownerId,
                acl: {
                    accessToken
                }
            };
        },
        
        
    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        this.services = {
            context: this.settings?.services?.context ?? "flow.context",
            query: this.settings?.services?.query ?? "flow.query",
            acl: this.settings?.services?.acl ?? "acl",
            timer: this.settings?.services?.timer ?? "timer",
            agents: this.settings?.services?.agents ?? "agents"
        };

        this.broker.waitForServices(Object.values(this.services));
        
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

        // default owner for subscription of events without owner
        this.adminGroupId = process.env.ADMIN_GROUP_ID;
        if (!this.adminGroupId) throw new Error("missing admin group in environment - ADMIN_GROUP_ID");

    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {}
    
};