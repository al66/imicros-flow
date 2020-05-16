/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const _ = require("lodash");
const { Constants } = require("imicros-flow-control");

/** Actions */
// action token { token } => { boolean }

module.exports = {
    name: "handler",
    
    /**
     * Service settings
     */
    settings: {
        /*
        services: {
            streams: "streams",
            context: "flow.context",
            query: "flow.query",
            acl: "acl",
            rules: "rules"
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

        /**
         * handle token
         * 
         * @actions
         * @param {String} process ID
         * @param {String} instance ID
         * @param {String} element ID
         * @param {String} type
         * @param {String} status
         * @param {Object} user
         * @param {String} ownerId
         * 
         * @returns {Boolean} result
         */
        handle: {
            params: {
                processId: { type: "uuid" },
                instanceId: { type: "uuid" },
                elementId: { type: "uuid", optional: true },
                type: { type: "string" },
                status: { type: "string" },
                user: { type: "object" },
                ownerId: { type: "string" }
            },
            async handler(ctx) {
                let token = ctx.params;
                let meta = await this.getMeta({ token: token });
                
                switch ( token.status ) {
                    case Constants.PROCESS_ACTIVATED:
                        // get default event(s) and activities w/o incoming sequences and emit token EVENT_ACTIVATED 
                        await this.activateDefault({ token: token, meta: meta });
                        break;
                    case Constants.EVENT_ACTIVATED:
                        // emit token EVENT_OCCURED 
                        await this.activateEvent({ token: token });
                        break;
                    case Constants.EVENT_OCCURED: 
                        // get next steps and emit activated tokens, dependent on element
                        await this.activateNext({ token: token });
                        break;
                    case Constants.SEQUENCE_ACTIVATED:
                        await this.evaluateSequence({ token: token });
                        break;
                    case Constants.SEQUENCE_COMPLETED:
                        // get next steps and emit activated tokens 
                        await this.activateNext({ token: token });
                        break;
                    case Constants.ACTIVITY_ACTIVATED:
                        // get activity attributes and evaluate start conditions
                        // if start conditions evaluate to true emit ready token
                        await this.prepareActivity({ token: token });
                        break;
                    case Constants.ACTIVITY_READY:
                        // get activity attributes and execute activity
                        // if executed w/o errors emit completed token
                        await this.startActivity({ token: token });
                        break;
                    case Constants.ACTIVITY_COMPLETED:
                        // get next sequence(s) and emit activated tokens
                        await this.activateNext({ token: token });
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
        },
        
        /**
         * update token
         * 
         * @actions
         * @param {String} context ID
         * @param {Array} token to consume
         * @param {Array} token to store in context w/o emitting
         * @param {Array} token to emit (and stored to context)
         * 
         * @returns {Boolean} result
         */
        update: {
            params: {
                instanceId: { type: "uuid" },
                consume: { 
                    type: "array",
                    item: "object", // token
                    optional: true
                },
                save: {
                    type: "array",
                    item: "object", // token
                    optional: true
                },
                emit: { 
                    type: "array",
                    item: "object", // token
                    optional: true
                }
            },
            handler(ctx) {
                
                // update token in context
                let opts = {
                    meta: ctx.meta
                };
                try {
                    let params = {
                        instanceId: ctx.params.instanceId,
                        consume: ctx.params.consume,
                        emit: ( ctx.params.emit &&  ctx.params.save ? ctx.params.emit.concat(ctx.params.save) : ( ctx.params.emit ? ctx.params.emit : ctx.params.save ) )
                    };
                    this.broker.call(this.services.context + ".updateToken", params, opts);
                } catch (err) {
                    this.logger.error("Failed to update context token", { instanceId: ctx.params.instanceId });
                    throw err;
                }
                
                // emit token - push to stream
                if (ctx.params.emit) {
                    for ( let i = 0; i < ctx.params.emit.length; i++ ) {
                        let params = {
                            stream: this.stream,
                            message: ctx.params.emit[i]
                        };
                        try {
                            this.broker.call(this.services.streams + ".add", params, opts);
                        } catch (err) {
                            this.logger.error("Failed to push emitted token to stream", { instanceId: ctx.params.instanceId, token: ctx.params.emit[i] });
                            throw err;
                        }
                    }
                }
                this.logger.info("Updated token", { instanceId: ctx.params.instanceId, consume: ctx.params.consume, save: ctx.params.save, emit: ctx.params.emit });
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
        },
        
        async getElement({ token }) {
            let element;
            let opts = {
                meta: await this.getMeta({ token: token })
            };
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
                element = await this.broker.call(this.services.query + action, { processId: token.processId, elementId: token.elementId }, opts);
            } catch (err) {
                this.logger.error("Failed to retrieve details of element", { token: token, action: this.services.query + action });
            }
            return element;
        },
        
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
        
        async activateNext({ token }) {
            // get next steps
            let next = [];
            let opts = {
                meta: await this.getMeta({ token: token })
            };
            try {
                next = await this.broker.call(this.services.query + ".next", { processId: token.processId, elementId: token.elementId }, opts);
            } catch (err) {
                this.logger.error("Failed to retrieve next elements", { token: token });
            }
            let emit = [];
            this.logger.debug("Activate next", { processId: token.processId, instanceId: token.instanceId, next: next });
            if ( Array.isArray(next) ) {
                for ( let i=0; i<next.length; i++ ) {
                    // build new token
                    let newToken = {
                        processId: token.processId,
                        instanceId: token.instanceId,
                        elementId: next[i].elementId,
                        type: next[i].type,
                        status: this.getInitialStatus({ type: next[i].type }),
                        user: token.user,
                        ownerId: token.ownerId
                    };
                    emit.push(newToken);
                }
            }
            let params = {
                instanceId: token.instanceId,
                consume: [token],
                emit: emit
            };
            opts = {
                meta: await this.getMeta({ token: token }),
                parentCtx: opts
            };
            await this.actions.update(params, opts);
        },
        
        async activateEvent({ token }) {

            switch ( token.type ) {
                // start
                case Constants.DEFAULT_EVENT:
                    {
                        // pass through, emit event occured token
                        let occured = token;
                        occured.status = Constants.EVENT_OCCURED;
                        let params = {
                            instanceId: token.instanceId,
                            consume: [token],
                            emit: [occured]
                        };
                        let opts = {
                            meta: await this.getMeta({ token: token })
                        };
                        await this.actions.update(params, opts);
                    }
                    break;
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
                    break;
            }    
        },
        
        async prepareActivity({ token }) {
            // prepare activity
            
            // if start conditions evaluate to true emit ready token
            let ready = token;
            ready.status = Constants.ACTIVITY_READY;
            let params = {
                instanceId: token.instanceId,
                consume: [token],
                emit: [ready]
            };
            let opts = {
                meta: await this.getMeta({ token: token })
            };
            await this.actions.update(params, opts);
        },
        
        async startActivity({ token }) {
            // start activity 
            let activity = await this.getElement({ token: token });
            this.logger.debug("start activity", { activity: activity });
            if ( activity.type === Constants.SERVICE_TASK) {
                // execute action
                let action = _.get(activity,"attributes.action",null);
                if (action) {
                    let opts = {
                        meta: await this.getMeta({ token: token })
                    };
                    try {
                        let keys = _.get(activity,"attributes.contextKeys",[]);
                        // get context
                        let context = await this.broker.call(this.services.context + ".getKeys", { instanceId: token.instanceId, keys: keys }, opts);
                        // prepare action parameters
                        let params = {};
                        // execute mapping rule for parameters
                        let ruleParams = _.get(activity,"attributes.parameterRule",null);
                        if (ruleParams && context) {
                            params = await this.broker.call(this.services.rules + ".eval", { name: ruleParams, data: context }, opts);
                        }
                        let result = await this.broker.call(action, params, opts);
                        let contextKey = _.get(activity,"attributes.contextKey",token.elementId);
                        // save result to context
                        if (result) {
                            await this.broker.call(this.services.context + ".add", { instanceId: token.instanceId, key: contextKey, value: result }, opts);
                        }
                        // if executed w/o errors emit completed token
                        let completed = token;
                        completed.status = Constants.ACTIVITY_COMPLETED;
                        params = {
                            instanceId: token.instanceId,
                            consume: [token],
                            emit: [completed]
                        };
                        await this.actions.update(params, opts);
                    } catch (err) {
                        this.logger.debug("Execution of service task failed", { error: err });
                        let failed = token;
                        failed.status = Constants.ACTIVITY_ERROR;
                        let params = {
                            instanceId: token.instanceId,
                            consume: [token],
                            emit: [failed]
                        };
                        await this.actions.update(params, opts);
                    }
                }
            }
        },

        async evaluateSequence({ token }) {

            switch ( token.type ) {
                // start
                case Constants.SEQUENCE_STANDARD:
                case Constants.SEQUENCE_DEFAULT:
                    {
                        // pass through, emit event occured token
                        let completed = token;
                        completed.status = Constants.SEQUENCE_COMPLETED;
                        let params = {
                            instanceId: token.instanceId,
                            consume: [token],
                            emit: [completed]
                        };
                        let opts = {
                            meta: await this.getMeta({ token: token })
                        };
                        await this.actions.update(params, opts);
                    }
                    break;
                case Constants.SEQUENCE_CONDITIONAL:
                    break;
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
        
        getInitialStatus({ type }) {
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
    
        this.serviceToken = process.env.SERVICE_TOKEN || "unvalid";
        
        this.stream = _.get(this.settings,"stream","token"); 
        
        this.services = {
            streams: _.get(this.settings,"services.streams","streams"),
            context: _.get(this.settings,"services.context","flow.context"),
            query: _.get(this.settings,"services.query","flow.query"),
            acl: _.get(this.settings,"services.acl","acl"),
            rules: _.get(this.settings,"services.rules","rules")
        };

        // token for service authentication at imicros-acl
        this.serviceToken = process.env.SERVICE_TOKEN;
        
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