/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");

/** Actions */
// action token { token } => { boolean }

module.exports = {
    name: "flow.sequence",
    
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
        "flow.sequence.*": {
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
                case Constants.SEQUENCE_ACTIVATED:
                    this.evaluateSequence({ token });
                    break;
                default:
                    this.logger.error("Unknown token status", { token });
            }            
        },
        
        async evaluateSequence({ token }) {

            switch ( token.type ) {
                // start
                case Constants.SEQUENCE_STANDARD:
                case Constants.SEQUENCE_DEFAULT:
                    {
                        // pass through, emit event occured token
                        let completed = Object.assign({},token);
                        completed.status = Constants.SEQUENCE_COMPLETED;
                        this.broker.emit("flow.token.consume", { token });
                        this.broker.emit("flow.token.emit", { token: completed });
                    }
                    break;
                case Constants.SEQUENCE_CONDITIONAL:
                    break;
            }
        },
        
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