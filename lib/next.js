/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");
const Base = require("./base");
const _ = require("./util/lodash");

/** Events **/
// flow.next { token } => { true }

module.exports = {
    name: "flow.next",
    
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
        }
    
    },

    /**
     * Methods
     */
    methods: {
        
        async handle({ token }) {
            switch ( token.status ) {
                case Constants.EVENT_OCCURED: 
                    // get next steps and emit activated tokens, dependent on element
                    await this.getNext({ token });
                    break;
                case Constants.SEQUENCE_COMPLETED:
                    // get next steps and emit activated tokens 
                    await this.getNext({ token });
                    break;
                case Constants.ACTIVITY_COMPLETED:
                    // get next sequence(s) and emit activated tokens
                    await this.getNext({ token });
                    break;
                case Constants.GATEWAY_COMPLETED:
                    // get outgoing sequences and emit sequence activated tokens
                    await this.getNext({ token });
                    break;
                default:
                    // ignore token
            }            
        },        
        
        async getNext({ token }) {
            this.logger.debug("get next", { processId: token.processId, instanceId: token.instanceId });

            // get next steps
            let next = [];
            let opts = await this.getOpts({ token: token });
            
            try {
                next = await this.broker.call(this.services.query + ".next", { processId: token.processId, elementId: token.elementId }, opts);
            } catch (err) {
                this.logger.error("Failed to retrieve next elements", { token: token });
            }
            this.logger.debug("Activate next", { processId: token.processId, instanceId: token.instanceId, next: next });
            if ( Array.isArray(next) ) {
                // contains a default sequence ?
                let defaultSequence;
                for(const element of next ) {
                    if (element.type === Constants.SEQUENCE_DEFAULT) {
                        defaultSequence = element;
                        break;
                    }
                }
                for(const element of next ) {
                    // build new token
                    let newToken = {
                        processId: token.processId,
                        versionId: token.versionId,
                        instanceId: token.instanceId,
                        elementId: element.uid,
                        type: element.type,
                        status: this.getInitialStatus({ type: element.type }),
                        user: token.user,
                        ownerId: token.ownerId,
                        attributes: {
                            lastElementId: token.elementId
                        }
                    };
                    // note default sequence to be notified, after conditional sequence is evaluated
                    if (defaultSequence) {
                        newToken.attributes = {
                            defaultSequence: defaultSequence.uid,
                            waitFor: next.filter(e => e.type !== Constants.SEQUENCE_DEFAULT && e.uid !== element.uid)
                        };
                    }
                    await this.emit({ token: newToken, opts });
                    // this.broker.emit("flow.token.emit", { token: newToken });
                }
            }
            await this.consume({ token, opts });
            if ( !Array.isArray(next) || next.length < 1 ) {
                // no more elements -> check, if instance is completed
                await this.checkFinished({ token, opts });
            }
            return true;

        },
        
        async checkFinished({ token, opts}) {
            let params = {
                processId: token.processId,
                instanceId: token.instanceId
            };
            let info = await this.broker.call(this.services.context + ".getToken", params, opts);
            this.logger.debug("check finished", { params, info });
            // no active tokens -> instance is completed
            params.ownerId = opts.meta.ownerId;
            if (info && info.token && info.token.length === 0) this.broker.emit("flow.instance.completed", params, opts);
        }

    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
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