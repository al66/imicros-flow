/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const Connector = require("./connector/neo4j");
const Serializer = require("./util/serializer");
const _ = require("lodash");

module.exports = {
    name: "flow.listener",
    
		/**
		 * Service settings
		 */
    settings: {
        /*
        db: {
            uri: "bolt://localhost:7474",
            user: "neo4j",
            password: "neo4j"
        },
        fetchBatchSize: 5
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
    actions: {},

		/**
		 * Events
		 */
    events: {},

		/**
		 * Methods
		 */
    methods: {
        
        run () {
            let loop = () => {
                this.running = true;
                this.connector.consume().then(() => { 
                    if (this.pause) {
                        this.running = false;
                        return;
                    }
                    if (this.running) setImmediate(loop); 
                });
            };
            loop();
        },
        
        async stop () {
            this.pause = true;
            return new Promise((resolve) => {
                let check = () => {
                    if (this.running) {
                        setTimeout(check,10); 
                        return;
                    } else {
                        return resolve();   
                    }
                };
                check();
            });
        },
        
    },

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
        this.serializer = new Serializer();
        this.fetchBatchSize = _.get(this.settings,"fetchBatchSize",5);
    },

    /**
	   * Service started lifecycle event handler
	   */
    async started() {
        await this.connector.connect();
        this.run();
    },

    /**
	   * Service stopped lifecycle event handler
	   */
    async stopped() {
        await this.stop();
        await this.connector.disconnect();
    }

};