/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const Connector = require("./connector/neo4j");

module.exports = {
    name: "flow.query",
    
    /**
	   * Service settings
	   */
    settings: {
        /*
        db: {
            uri: "bolt://localhost:7474",
            user: "neo4j",
            password: "neo4j"
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
    //dependencies: [],	

    /**
     * Actions
     */
    actions: {

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
                return await this.connector.nextActions(ctx.params.event);
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