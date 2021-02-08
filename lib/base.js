/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");

module.exports = {

    /**
     * Methods
     */
    methods: {

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
        
        async getOpts({ token }) {
            let opts = {
                meta: await this.getMeta({ token })
            };
            return opts;
        },
        
        async getMeta({ token }) {
            let accessToken;
            let opts = {
                meta: {
                    service: {
                        serviceId: this.serviceId,
                        serviceToken: this.serviceToken
                    },
                    user: token.user
                }
            };
            try {
                let res = await this.broker.call(this.services.agents + ".requestAccess", { ownerId: token.ownerId }, opts);
                if (res && res.token) accessToken = res.token;
            } catch (err) {
                this.logger.error("Failed to retrieve access token", { token: token });
            }
            return {
                service: {
                    serviceId: this.serviceId,
                    serviceToken: this.serviceToken
                },
                user: token.user,
                ownerId: token.ownerId,
                acl: {
                    accessToken
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
        },
        
        async emit({ token, opts = null }) {
            
            this.logger.debug("emit called", { token });
            // save token in context
            let params = {
                processId: token.processId,
                instanceId: token.instanceId,
                token: token
            };
            await this.broker.call(this.services.context + ".saveToken", params, opts);

            this.broker.emit("flow.token.emit", { token });
        },
        
        async consume({ token, opts = null }) {
            
            this.logger.debug("consume called", { token });
            // remove token from context
            let params = {
                processId: token.processId,
                instanceId: token.instanceId,
                token: token
            };
            await this.broker.call(this.services.context + ".removeToken", params, opts);

            this.broker.emit("flow.token.consume", { token });
        }

    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    },

    /**
     * Service started lifecycle event handler
     */
    async started() {
    }
};        