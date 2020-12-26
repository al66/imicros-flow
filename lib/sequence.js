/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");
const Base = require("./base");
const _ = require("./util/lodash");

/** Events **/
// flow.sequence.* { token } => true

module.exports = {
    name: "flow.sequence",
    
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
            rules: "rules",
            feel: "flow.feel"
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
    actions: {
        activated: {
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
            async handler(ctx) {
                await this.sequenceAcvtivated({ token: ctx.params.token });
                return true;
            }
        }
    },

    /**
     * Events
     */
    events: {

        "flow.sequence.evaluated": {
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
                this.handleEvaluated({ token: ctx.params.token });
            }
        }
    },

    /**
     * Methods
     */
    methods: {

        async sequenceAcvtivated({ token }) {
            let opts = {
                meta: await this.getMeta({ token: token })
            };
            let sequence = await this.getElement({ token, opts });

            switch ( token.type ) {
                // start
                case Constants.SEQUENCE_STANDARD:
                    // will be evaluated in case of a proceeding exclusive gateway and otherwise just passed trough
                    await this.evaluateSequence({ token, sequence, opts });
                    break;
                case Constants.SEQUENCE_DEFAULT:
                    // default sequence will be activated by evaluation of the other outgoing sequences
                    this.broker.emit("flow.token.consume", { token });
                    break;
                case Constants.SEQUENCE_CONDITIONAL:
                    await this.evaluateSequence({ token, sequence, opts });
                    break;
            }
        },
        
        
        
        async evaluateSequence({ token, sequence, opts }) {
            let result = true;

            // evaluate condition
            if ( token.type === Constants.SEQUENCE_CONDITIONAL || _.get(sequence,"attributes.exclusiveGateway",false) ) {
                result = null;
                result = await this.evaluateCondition({ token, sequence, opts });
            }

            let newToken = _.cloneDeep(token);
            // clean up passed attributes for handling of sequence 
            if (newToken.attributes) {
                delete newToken.attributes.defaultSequence;
                delete newToken.attributes.waitFor;
                delete newToken.attributes.exclusiveGateway;
            }

            switch ( result ) { 
                case null:
                    newToken.status = Constants.SEQUENCE_ERROR;
                    break;
                case true:
                    newToken.status = Constants.SEQUENCE_COMPLETED;
                    break;
                case false:
                    newToken.status = Constants.SEQUENCE_REJECTED;
                    break;
            }
            // consume processed token and emit new one
            this.broker.emit("flow.token.consume", { token });
            this.broker.emit("flow.token.emit", { token: newToken });

            // notify for default sequence handling
            if (token.attributes && token.attributes.defaultSequence) {
                this.logger.info("sequence evaluated", { token: newToken });
                let notify = await _.cloneDeep(token);
                notify.status = newToken.status;
                this.broker.emit("flow.sequence.evaluated", { token: notify });
            }
        },
        
        async evaluateCondition({ token, sequence, opts }) {
            // used keys for context
            let keys = _.get(sequence,"attributes.contextKeys",[]);
            // get context
            let context = await this.broker.call(this.services.context + ".getKeys", { instanceId: token.instanceId, keys: keys }, opts);

            // evaluate ruleset
            let ruleset = _.get(sequence,"attributes.ruleset",null);
            if (ruleset) {
                this.logger.info("execute business rule", { ruleset });
                try {
                    // evaluate
                    let result = await this.broker.call(this.services.rules + ".eval", { name: ruleset, data: context || {} }, opts);
                    let resultKey = _.get(sequence,"attributes.resultKey","result");
                    // dependent on result: complete or reject
                    if (result && result[resultKey] === true) {
                        return true;
                    } else {
                        return false;
                    }
                } catch (err) {
                    this.logger.debug("Execution of rule task failed", { error: err });
                    return null;
                }
            }
            
            // evaluate feel expression
            let feel = _.get(sequence,"attributes.feel",null);
            if (feel) {
                this.logger.info("evaluate feel expression", { feel });
                try {
                    // evaluate
                    let result = await this.broker.call(this.services.feel + ".evaluate", { expression: feel, context: context || {} }, opts);
                    // dependent on result: complete or reject
                    if (result === true) {
                        return true;
                    } else {
                        return false;
                    }
                } catch (err) {
                    this.logger.debug("Evaluation of feel expression failed", { error: err });
                    return null;
                }
            }

            // default - invalid condition
            return null;
            
        },
        
        async handleEvaluated({ token }) {
            if (!token.attributes || !token.attributes.defaultSequence || !token.attributes.waitFor ) {
                this.logger.warn("handleEvaluated - unvalid token", { token });
                return;
            }
            // save result in status for element sequence default
            let params = { 
                processId: token.processId, 
                instanceId: token.instanceId, 
                elementId: token.attributes.defaultSequence,
                token 
            };
            let opts = {
                meta: await this.getMeta({ token })
            };
            this.logger.debug("call context.saveToken", { params });
            await this.broker.call(this.services.context + ".saveToken", params, opts);
            
            // if status rejected
            if (token.status === Constants.SEQUENCE_REJECTED) {
                // get status of element sequence default from db
                let status = await this.broker.call(this.services.context + ".getToken", { 
                    processId: token.processId, 
                    instanceId: token.instanceId, 
                    elementId: token.attributes.defaultSequence
                }, opts);
                // if last update by this token check status
                if (status && status.token && status.last === token) {
                    let received = [];
                    for (let sequenceId in token.attributes.waitFor) {
                        let result = null;
                        for (let token in status.token) {
                            if (token.elementId === sequenceId) {
                                result = token.status === Constants.SEQUENCE_REJECTED ? true : false;
                                break;
                            }
                        }
                        received.push(result);
                    }
                    // received all expected tokens?
                    if (received.length === token.attributes.waitFor.length) {
                        // one sequence not rejected? 
                        if (received.indexOf(false) >= 0) {
                            // TODO: set ttl for store item or delete store item
                            
                        } else {
                            // all other sequences rejected -> emit new token for default sequence
                            let completed = _.cloneDeep(token);
                            completed.status = Constants.SEQUENCE_COMPLETED;
                            completed.elementId = token.attributes.defaultSequence;
                            delete completed.attributes.defaultSequence;
                            delete completed.attributes.waitFor;
                            this.broker.emit("flow.token.emit", { token: completed });
                        }
                    }
                }
            }
            
        }
        
    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        this.services = {
            context: _.get(this.settings,"services.context","flow.context"),
            query: _.get(this.settings,"services.query","flow.query"),
            acl: _.get(this.settings,"services.acl","acl"),
            rules: _.get(this.settings,"services.rules","rules"),
            feel: _.get(this.settings,"services.feel","flow.feel")
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