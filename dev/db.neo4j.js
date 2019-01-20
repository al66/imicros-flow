/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const neo4j	= require("neo4j-driver").v1;

module.exports = {
    name: "db.ne4j",
        
    /**
     * Service settings
     */
    settings: {},

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

        /**
         * Connect to database
         */
        connect() {
            
            /* istanbul ignore else */
            if (!this.database) {
                this.database = {};
                this.database.uri = this.settings.uri || "bolt://localhost:7474";
                this.database.user = this.settings.user || "neo4j";
                this.database.password = this.settings.password || "neo4j";
            }
            
            this.driver = neo4j.driver(this.database.uri, neo4j.auth.basic(this.database.user, this.database.password));
            return Promise.resolve();
        },

        /**
         * Disconnect from database
         */
        disconnect() {
            /* istanbul ignore next */
            if (!this.driver) return Promise.resolve();
            this.driver.close();
            this.logger.info(`Disconnected from ${this.database.uri}`);
            return Promise.resolve();
        },

        /**
         * Execute statement
         *
         * @param {String} statement 
         * 
         * @returns {Object} result
         */
        run(statement, param) {
            let session = this.driver.session();
            let response = [];
            let self = this;
            
            return session
                .run(statement, param)
                .then(function (result) {
                    if (result.records) {
                        result.records.forEach(function (record) {
                            response.push(record.toObject());
                        });
                    }
                    session.close();
                    return response;
                })
                .catch(err => {
                    self.logger.error(`Database Statement ${statement} with params ${JSON.stringify(param)}`);
                    self.logger.error(`Database driver error: ${JSON.stringify(err)}`);
                });
        }
        
    },

    /**
     * Service created lifecycle event handler
     */
    created() {
        
    },

    /**
     * Service started lifecycle event handler
     */
    started() {

        // Connect to database
        return new Promise(resolve => {
            this.connect()
                .then(() => {
                    this.logger.info(`Connected to database ${this.database.uri}`);
                    return resolve();
                });
        });
        
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {

        // Disconnect from database
        await this.disconnect();
        
    }
    
};