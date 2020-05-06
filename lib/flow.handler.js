/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const Constants = require("./util/constants");
const _ = require("lodash");

/** Actions */
// action token { token } => { boolean }

module.exports = {
    name: "handler",
    
    /**
     * Service settings
     */
    settings: {
        /*
        actions: {
            next: "flow.query.next",
            saveToken: "context.saveToken",
            emitToken: "flow.publisher.emitToken"
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
    //dependencies: ["flow.query"],	

    /**
     * Actions
     */
    actions: {

        event: {
            params: {
                event: { type: "string" },
                payload: { type: "any" },
                version: { type: "string" },
                uid: { type: "string" },
                timestamp: { type: "number" }
            },
            handler(/*ctx*/) {
                //
                // get owner
                //
                // get subscriptions
                // 
                // check authorization
                //
                // check meta data for existing process context
                //
                // if initial event, create new context
                //   - save payload to context
                // 
                // emit event occured token 
                /*
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                this.logger.info(this.name + " called", result);
                return result;
                */
            }
        },
        
        /**
         * handle token
         * 
         * @actions
         * @param {Object} token
         * 
         * @returns {Boolean} result
         */
        token: {
            params: {
                token: { type: "object", props: {
                    process: { type: "uuid" },
                    instance: { type: "uuid" },
                    step: { type: "uuid", optional: true },
                    status: { type: "string" }
                } }
            },
            async handler(ctx) {
                let token = ctx.params.token;
                let meta = await this.broker.call(this.actions.getMeta, { token: token });
                if ( !meta || !meta.acl ) {
                    this.logger.error("Missing meta data for token", { token: token });
                    return false;
                }
                let current = await this.broker.call(this.actions.current, { process: token.process, step: token.step }, { meta: meta });
                if ( !current ) {
                    this.logger.error("Failed to retrieve details of current step", { token: token });
                    throw new Error("Failed to retrieve details of current step");
                }
                
                switch ( token.status ) {
                    case Constants.PROCESS_ACTIVATED:
                        // get default event(s) and activities w/o incoming sequences and emit activated tokens 
                        await this.activateDefault({ token: token, meta: meta });
                        break;
                    case Constants.EVENT_ACTIVATED:
                        await this.activateEvent({ token: token, current: current, meta: meta });
                        // ?get next steps and emit activated tokens 
                        // ?await this.activateNext({ token: token, meta: meta });
                        break;
                    case Constants.EVENT_OCCURED: 
                        // get next steps and emit activated tokens 
                        await this.activateNext({ token: token, meta: meta });
                        break;
                    case Constants.SEQUENCE_ACTIVATED:
                        await this.evaluateSequence({ token: token, current: current, meta: meta });
                        break;
                    case Constants.SEQUENCE_COMPLETED:
                        // get next steps and emit activated tokens 
                        await this.activateNext({ token: token, meta: meta });
                        break;
                    case Constants.ACTIVITY_ACTIVATED:
                        // get activity attributes and evaluate start conditions
                        // if start conditions evaluate to true emit ready token
                        await this.prepareActivity({ token: token, meta: meta });
                        break;
                    case Constants.ACTIVITY_READY:
                        // get activity attributes and execute activity
                        // if executed w/o errors emit completed token
                        await this.startActivity({ token: token, meta: meta });
                        break;
                    case Constants.ACTIVITY_COMPLETED:
                        // get next sequence(s) and emit activated tokens
                        await this.activateNext({ token: token, meta: meta });
                        break;
                    case Constants.GATEWAY_ACTIVATED:
                        // get gateway attributes and evaluate gateway
                        // if condition evaluate to true emit completed token
                        await this.evaluateMergingGateway({ token: token, meta: meta });
                        break;
                    case Constants.GATEWAY_COMPLETED:
                        // get outgoing sequences and emit sequence activated tokens
                        await this.evaluateSplittingGateway({ token: token, meta: meta });
                        break;
                    default:
                        this.logger.error("Unknown token status", { token: token });
                }
                await this.upstreamCheck({ token: token, meta: meta });
                return true;
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
        
        async activateDefault({ token, meta }) {
            // get start events or activities w/o incoming sequences
            let next = await this.broker.call(this.actions.default, { process: token.process }, { meta: meta });
            this.logger.debug("Activate default", { process: token.process, instance: token.instance, next: next });
            if ( Array.isArray(next) ) {
                for ( let i=0; i<next.length; i++ ) {
                    // build new token
                    token.step = next[i].id;
                    token.status = this.getInitialStatus({ type: next[i].type });
                    // save & emit new token
                    await this.broker.call(this.actions.saveToken, { token: token }, { meta: meta });
                    await this.broker.call(this.actions.emitToken, { token: token }, { meta: meta });
                }
            }            
        },
        
        async activateNext({ token, meta }) {
            // get next steps
            let next = await this.broker.call(this.actions.next, { current: token.step }, { meta: meta });
            this.logger.debug("Activate next", { process: token.process, instance: token.instance, next: next });
            if ( Array.isArray(next) ) {
                for ( let i=0; i<next.length; i++ ) {
                    // build new token
                    token.step = next[i].id;
                    token.status = this.getInitialStatus({ type: next[i].type });
                    // save & emit new token
                    await this.broker.call(this.actions.saveToken, { token: token }, { meta: meta });
                    await this.broker.call(this.actions.emitToken, { token: token }, { meta: meta });
                }
            }            
            
        },
        
        async activateEvent({ token, current, meta }) {

            switch ( current.type ) {
                // start
                case Constants.DEFAULT_EVENT:
                    token.status = Constants.EVENT_OCCURED;
                    await this.broker.call(this.actions.saveToken, { token: token }, { meta: meta });
                    await this.broker.call(this.actions.emitToken, { token: token }, { meta: meta });
                    break;
                case Constants.MESSAGE_EVENT:
                    token.status = Constants.EVENT_WAITING;
                    await this.broker.call(this.actions.saveToken, { token: token }, { meta: meta });
                    await this.broker.call(this.actions.emitToken, { token: token }, { meta: meta });
                    break;
                case Constants.TIMER_EVENT:
                    token.status = Constants.EVENT_WAITING;
                    await this.broker.call(this.actions.saveToken, { token: token }, { meta: meta });
                    await this.broker.call(this.actions.emitToken, { token: token }, { meta: meta });
                    break;
                case Constants.ESCALATION_EVENT:
                case Constants.CONDITIONAL_EVENT:
                case Constants.ERROR_EVENT:
                case Constants.CANCEL_EVENT:
                case Constants.COMPENSATION_EVENT:
                case Constants.SIGNAL_EVENT:
                case Constants.MULTIPLE_EVENT:
                case Constants.PARALLEL_MULTIPLE_EVENT:
                case Constants.TERMINATE_EVENT:
                    break;
            }    
        },
        
        async prepareActivity({ token, meta }) {
            // prepare activity
            
            // if start conditions evaluate to true emit ready token
            token.status = Constants.ACTIVITY_READY;
            await this.broker.call(this.actions.saveToken, { token: token }, { meta: meta });
            await this.broker.call(this.actions.emitToken, { token: token }, { meta: meta });
        },
        
        async startActivity({ token, meta }) {
            // start activity 
            
            // if executed w/o errors emit completed token
            token.status = Constants.ACTIVITY_COMPLETED;
            await this.broker.call(this.actions.saveToken, { token: token }, { meta: meta });
            await this.broker.call(this.actions.emitToken, { token: token }, { meta: meta });
        },

        async evaluateSequence({ token, meta }) {
            let result;
            let current = await this.broker.call(this.actions.current, { process: token.process, step: token.step }, { meta: meta });
            
            // standard sequence, nothing to do
            if (current.type === Constants.SEQUENCE_STANDARD) {
                result = true;
            }
            
            // emit token completed
            if (result == true) {
                token.status = Constants.SEQUENCE_COMPLETED;
                await this.broker.call(this.actions.saveToken, { token: token }, { meta: meta });
                await this.broker.call(this.actions.emitToken, { token: token }, { meta: meta });
            }
            
        },
        
        async evaluateMergingGateway({ token, meta }) {
            let result;
            let current = await this.broker.call(this.actions.current, { process: token.process, step: token.step }, { meta: meta });

            switch ( current.type ) {
                case Constants.EXCLUSIVE_GATEWAY:
                case Constants.EVENT_BASED_GATEWAY:
                case Constants.PARALLEL_GATEWAY:
                    result = true;
                    break;
                case Constants.INCLUSIVE_GATEWAY:
                case Constants.EXCLUSIVE_EVENT_BASED_GATEWAY:
                case Constants.PARALLEL_EVENT_BASED_GATEWAY:
                    break;
            }
            
            let activeToken = await this.broker.call(this.actions.getActiveToken, { process: token.process, instance: token.instance }, { meta: meta });
            let entryToken = [];
            // evaluate gateway
            
            // if evaluated to true, consume entry token and emit completed token
            if (result == true) {
                token.status = Constants.GATEWAY_COMPLETED;
                await this.broker.call(this.actions.saveToken, { token: token }, { meta: meta });
                // consume entry tokens
                
                await this.broker.call(this.actions.emitToken, { token: token }, { meta: meta });
            }
        },
        
        async evaluateSplittingGateway({ token, meta }) {
            let result;
            let current = await this.broker.call(this.actions.current, { process: token.process, step: token.step }, { meta: meta });

            switch ( current.type ) {
                case Constants.EXCLUSIVE_GATEWAY:
                    // evaluate each outgoing condition, activate the first which evaluates to true
                    
                    break;
                case Constants.EVENT_BASED_GATEWAY:
                    {
                        // build red button token
                        let redButton = token;
                        redButton.status = Constants.GATEWAY_RED_BUTTON;
                        await this.broker.call(this.actions.saveToken, { token: redButton }, { meta: meta });
                        
                        // request all direct following events or receive tasks
                        let next = await this.broker.call(this.actions.nextEventGateway, { current: token.step }, { meta: meta });
                        this.logger.debug("Splitting at event-based gateway - activate next", { process: token.process, instance: token.instance, next: next });
                        if ( Array.isArray(next) ) {
                            for ( let i=0; i<next.length; i++ ) {
                                // build new token
                                token.step = next[i].id;
                                token.status = this.getInitialStatus({ type: next[i].type });
                                token.redButton = redButton;
                                token.aim = {
                                    step: next[i].eventId,
                                    status: this.getFinalStatus({ type: next[i].eventType })
                                };
                                // save/emit token for each outgoing sequence
                                await this.broker.call(this.actions.saveToken, { token: token }, { meta: meta });
                                await this.broker.call(this.actions.emitToken, { token: token }, { meta: meta });
                            }
                        }            
                    }
                    break;
                case Constants.PARALLEL_GATEWAY:
                    // get next sequence(s) and emit activated tokens
                    await this.activateNext({ token: token, meta: meta });
                    break;
                case Constants.INCLUSIVE_GATEWAY:
                    // get next sequence(s) and emit activated tokens
                    await this.activateNext({ token: token, meta: meta });
                    break;
                case Constants.EXCLUSIVE_EVENT_BASED_GATEWAY:
                    break;
                case Constants.PARALLEL_EVENT_BASED_GATEWAY:
                    break;
            }
            
            // if evaluated to true, consume entry token and emit completed token
            if (result == true) {
                token.status = Constants.GATEWAY_COMPLETED;
                await this.broker.call(this.actions.saveToken, { token: token }, { meta: meta });
                // consume entry tokens
                
                await this.broker.call(this.actions.emitToken, { token: token }, { meta: meta });
            }
        },
        
        async upstreamCheck({ token, meta }) {
            
        },
        
        async getInitialStatus({ type }) {
            let status;
            switch ( type ) {
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
                    status = Constants.EVENT_ACTIVATED;
                    break;
                // task
                case Constants.SEND_TASK:
                case Constants.RECEIVE_TASK:
                case Constants.USER_TASK:
                case Constants.MANUAL_TASK:
                case Constants.BUSINESS_RULE_TASK:
                case Constants.SERVICE_TASK:
                case Constants.SCRIPT_TASK:
                    status = Constants.ACTIVITY_ACTIVATED;
                    break;
                // sequence
                case Constants.SEQUENCE_STANDARD:
                case Constants.SEQUENCE_CONDITIONAL:
                case Constants.SEQUENCE_DEFAULT:
                    status = Constants.SEQUENCE_ACTIVATED;
                    break;
                // gateway
                case Constants.EXCLUSIVE_GATEWAY:
                case Constants.EVENT_BASED_GATEWAY:
                case Constants.PARALLEL_GATEWAY:
                case Constants.INCLUSIVE_GATEWAY:
                case Constants.EXCLUSIVE_EVENT_BASED_GATEWAY:
                case Constants.PARALLEL_EVENT_BASED_GATEWAY:
                    status = Constants.GATEWAY_ACTIVATED;
                    break;
            }
            if (!status) this.logger.error("Missing status for token type", { type: type });
            return status;
        }
        
    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        this.actions = {
            next: _.get(this.settings,"actions.next","flow.query.next"),
            nextEventGateway: _.get(this.settings,"actions.nextEventGateway","flow.query.nextEventGateway"),
            current: _.get(this.settings,"actions.current","flow.query.current"),
            default: _.get(this.settings,"actions.default","flow.query.default"),
            saveToken: _.get(this.settings,"actions.saveToken","context.saveToken"),
            deleteToken: _.get(this.settings,"actions.deleteToken","context.deleteToken"),
            emitToken: _.get(this.settings,"actions.emitToken","flow.publisher.emitToken"),
            getActiveToken: _.get(this.settings,"actions.getActiveToken","context.getToken"),
            getMeta: _.get(this.settings,"actions.getMeta","flow.metadata.get")
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