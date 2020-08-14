/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");
const { v4: uuid } = require("uuid");
const parser = require("cron-parser");
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
        "flow.event.activated": {
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
        
        "flow.event.scheduled": {
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
                    await this.activateTimer({ token });
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
        
        async activateTimer({ token }) {
            // get event details
            let event = await this.getElement({ token });
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
                        this.broker.emit("flow.instance.created", { ownerId: token.ownerId, processId: token.processId, instanceId: token.instanceId });
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
            acl: _.get(this.settings,"services.acl","acl"),
            timer: _.get(this.settings,"services.timer","timer")
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