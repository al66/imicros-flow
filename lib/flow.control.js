/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const Connector = require("./connector/neo4j");

module.exports = {
    name: "flow.control",
    
    /**
	   * Service settings
	   */
    settings: {
        /*
        topic: "events"
        */
    },

    /**
	   * Service metadata
	   */
    metadata: {},

    /**
	   * Service dependencies
	   */
    //dependencies: [],	

    /**
     * Actions
     */
    actions: {

        addNext: {
            params: {
                listen: { 
                    type: "object", 
                    props: {
                        name: { type: "string", empty: false },
                        owner: { 
                            type: "object",
                            props: {
                                type: { type: "string"},
                                id: { type: "string" }
                            },
                            optional: true    
                        },
                        process: { type: "string", optional: true },
                        step: { type: "string", optional: true }
                    }
                },
                task: { 
                    type: "object",
                    props: {
                        process: { type: "string", empty: false },
                        step: { type: "string", empty: false },
                        owner: { 
                            type: "object",
                            props: {
                                type: { type: "string"},
                                id: { type: "string" }
                            }    
                        },
                        service: { type: "string", empty: false },
                        action: { type: "string", empty: false },
                        map: { type: "object", optional: true }                    }
                },
                onDone: {
                    type: "object",
                    props: {
                        name: { type: "string", empty: false }
                    },
                    optional: true
                },
                onError: {
                    type: "object",
                    props: {
                        name: { type: "string", empty: false }
                    },
                    optional: true
                }
                
            },
            async handler(ctx) {
                return await this.connector.addNext (ctx.params.listen, ctx.params.task, ctx.params.onDone, ctx.params.onError);
            }
        },
        
        next: {
            params: {
                event: { 
                    type: "object", 
                    props: {
                        name: { type: "string", empty: false },
                        owner: { 
                            type: "object",
                            props: {
                                type: { type: "string"},
                                id: { type: "string" }
                            }    
                        },
                        process: { type: "string", optional: true },
                        step: { type: "string", optional: true }
                    }
                }                
            },
            async handler(ctx) {
                return await this.connector.next(ctx.params.event);
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
    methods: {},

    /**
     * Service created lifecycle event handler
     */
    created() {
        let options = {
            uri: this.settings.db ? this.settings.db.uri : null,
            user: this.settings.db ? this.settings.db.user : null,
            password: this.settings.db ? this.settings.db.password : null
        };
        this.connector = new Connector(this.broker, options);
    },

    /**
	   * Service started lifecycle event handler
	   */
    async started() {
        await this.connector.connect();
    },

    /**
	   * Service stopped lifecycle event handler
	   */
    async stopped() {
        await this.connector.disconnect();
    }
};