/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const Connector = require("./connector/neo4j");
const _ = require("lodash");

module.exports = {
    name: "flow.emitter",
    
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
        
        emit: {
            params: {
                eventName: { type: "string" },
                payload: { type: "any", optional:true },
                meta: { type: "any", optional:true }
            },
            async handler(ctx) {
                // Emit event
                try {
                    await this.connector.emit(ctx.params.eventName, ctx.params.payload, ctx.params.meta);
                    this.logger.debug(`Emitted event ${ctx.params.eventName}`, { meta: ctx.params.meta });
                } catch (err) {
                    this.logger.error(`Failed to emit event ${ctx.params.eventName}`, { meta: ctx.params.meta, err: err });
                    throw err;
                }
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
    methods: {},

    /**
     * Service created lifecycle event handler
     */
    created() {
        let options = {
            uri: _.get(this.settings,"db.uri","bolt://localhost:7474"),
            user: _.get(this.settings,"db.user","neo4j"),
            password: _.get(this.settings,"db.password","neo4j")
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