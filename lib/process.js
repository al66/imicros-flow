/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");

/** Events **/
// flow.process.* { token } => { true }

module.exports = {
    name: "flow.process",
    
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
        "flow.process.*": {
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
                case Constants.PROCESS_ACTIVATED:
                    this.activateDefault({ token });
                    break;
                default:
                    this.logger.error("Unknown token status", { token });
            }            
        },
        
        async activateDefault({ token }) {
            let meta = await this.getMeta({ token: token });
            
            // get start events or activities w/o incoming sequences
            let next = await this.broker.call(this.services.query + ".default", { process: token.process }, { meta });
            this.logger.debug("Activate default", { process: token.process, instance: token.instance, next });
            if ( Array.isArray(next) ) {
                for ( let i=0; i<next.length; i++ ) {
                    // build new token
                    let init = Object.assign({},token);
                    init.step = next[i].id;
                    init.status = this.getInitialStatus({ type: next[i].type });
                    // emit new token
                    this.broker.emit("flow.token.emit", { token: init });
                }
            }            
        },
        
        async evaluateSequence({ token }) {

            switch ( token.type ) {
                // start
                case Constants.SEQUENCE_STANDARD:
                    {
                        // pass through, emit event occured token
                        let completed = Object.assign({},token);
                        completed.status = Constants.SEQUENCE_COMPLETED;
                        this.broker.emit("flow.token.consume", { token });
                        this.broker.emit("flow.token.emit", { token: completed });
                    }
                    break;
                case Constants.SEQUENCE_DEFAULT:
                    break;
                case Constants.SEQUENCE_CONDITIONAL:
                    break;
            }
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
    
        // token for service authentication at imicros-acl
        this.serviceToken = process.env.SERVICE_TOKEN || "unvalid";
        
        this.services = {
            // context: _.get(this.settings,"services.context","flow.context"),
            // query: _.get(this.settings,"services.query","flow.query"),
            // acl: _.get(this.settings,"services.acl","acl")
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