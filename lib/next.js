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
        "flow.next": {
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
        async handle({ token }) {

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
                    this.broker.emit("flow.token.emit", { token: newToken });
                }
            }
            this.broker.emit("flow.token.consume", { token });
            if ( !Array.isArray(next) || next.length < 1 ) {
                let params = {
                    event: "flow.token.final",
                    time: Date.now() + 5000,    // add 5 second to ensure all flow.token.emit and flow.token.consume events are processed
                    payload: { token }
                };
                await this.broker.call(this.services.timer + "schedule", params);
            }
            return true;

        }

    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        this.services = {
            // context: _.get(this.settings,"services.context","flow.context"),
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