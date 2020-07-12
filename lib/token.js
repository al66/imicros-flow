/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");

/** Actions */
// action token { token } => { boolean }

module.exports = {
    name: "flow.token",
    
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
                        instanceId: { type: "uuid" },
                        elementId: { type: "uuid", optional: true },
                        type: { type: "string" },
                        status: { type: "string" },
                        user: { type: "object" },
                        ownerId: { type: "string" }
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
                    // get default event(s) and activities w/o incoming sequences and emit token EVENT_ACTIVATED or ACTIVITY_ACTIVATED
                    this.broker.emit("flow.process.activated",{ token });
                    break;
                case Constants.PROCESS_COMPLETED:
                    // cleanup
                    this.broker.emit("flow.process.completed",{ token });
                    break;
                case Constants.EVENT_ACTIVATED:
                    this.broker.emit("flow.event.activated", { token });
                    break;
                case Constants.EVENT_OCCURED: 
                    // get next steps and emit activated tokens, dependent on element
                    this.broker.emit("flow.next", { token });
                    break;
                case Constants.SEQUENCE_ACTIVATED:
                    this.broker.emit("flow.sequence.activated", { token });
                    break;
                case Constants.SEQUENCE_COMPLETED:
                    // get next steps and emit activated tokens 
                    this.broker.emit("flow.next", { token });
                    break;
                case Constants.ACTIVITY_ACTIVATED:
                    // get activity attributes and evaluate start conditions
                    // if start conditions evaluate to true emit ready token
                    this.broker.emit("flow.activity.activated", { token });
                    break;
                case Constants.ACTIVITY_READY:
                    // get activity attributes and execute activity
                    // if executed w/o errors emit completed token
                    this.broker.emit("flow.activity.ready", { token });
                    break;
                case Constants.ACTIVITY_COMPLETED:
                    // get next sequence(s) and emit activated tokens
                    this.broker.emit("flow.next", { token });
                    break;
                case Constants.GATEWAY_ACTIVATED:
                    this.broker.emit("flow.gateway.activated", { token });
                    break;
                case Constants.GATEWAY_READY:
                    // get gateway attributes and evaluate gateway
                    // if condition evaluate to true emit completed token
                    this.broker.emit("flow.gateway.ready", { token });
                    break;
                case Constants.GATEWAY_COMPLETED:
                    // get outgoing sequences and emit sequence activated tokens
                    this.broker.emit("flow.next", { token });
                    break;
                default:
                    this.logger.error("Unknown token status", { token });
            }            
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