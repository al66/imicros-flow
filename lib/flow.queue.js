/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const Redis = require("ioredis");

/** Actions */
// action push { queue, object } => { length }
// action pop { queue } => { object }
// action length { queue } => { length }

module.exports = {
    name: "keys",
    
    /**
     * Service settings
     */
    settings: {
        /*
        redis: {
            port: process.env.REDIS_PORT || 6379,
            host: process.env.REDIS_HOST || "127.0.0.1",
            password: process.env.REDIS_AUTH || "",
            db: process.env.REDIS_DB || 0,
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
    //dependencies: ["any"],	

    /**
     * Actions
     */
    actions: {

        /**
         * push object to queue
         * 
         * @actions
         * @param {String} queue
         * @param {Object} object or array of objects
         * 
         * @returns {Integer} length 
         */
        push: {
            params: {
                queue: { type: "string" },
                object: [ { type: "object"}, { type: "array"} ]
            },
            async handler(ctx) {
                let objects = [];
                if (Array.isArray(ctx.params.object)) {
                    objects = ctx.params.object.map((object) => { return JSON.stringify(object); });
                } else {
                    objects.push(JSON.stringify(ctx.params.object));
                }
                let length = await this.client.lpush(ctx.params.queue, objects);
                return { queue: ctx.params.queue, length: length };
            }
        },

        /**
         * get object from queue
         * 
         * @actions
         * @param {String} queue
         * 
         * @returns {Object} object 
         */
        pop: {
            params: {
                queue: { type: "string" }
            },
            async handler(ctx) {
                let element = await this.client.rpop(ctx.params.queue);
                let object;
                try {
                    object = JSON.parse(element);
                } catch(e) {
                    object = null;
                }
                return object;
            }
        },

        /**
         * get length of queue
         * 
         * @actions
         * @param {String} queue
         * 
         * @returns {Integer} length 
         */
        length: {
            params: {
                queue: { type: "string" }
            },
            async handler(ctx) {
                let length = await this.client.llen(ctx.params.queue);
                return { queue: ctx.params.queue, length: length };
            }
        },

    },

    /**
     * Events
     */
    events: {},

    /**
     * Methods
     */
    methods: {

        connect () {
            return new Promise((resolve, reject) => {
                /* istanbul ignore else */
                let redisOptions = this.settings.redis || {};   // w/o settings the client uses defaults: 127.0.0.1:6379
                this.client = new Redis(redisOptions);

                this.client.on("connect", (() => {
                    this.connected = true;
                    this.logger.info("Connected to Redis");
                    resolve();
                }).bind(this));

                this.client.on("close", (() => {
                    this.connected = false;
                    this.logger.info("Disconnected from Redis");
                }).bind(this));

                this.client.on("error", ((err) => {
                    this.logger.error("Redis redis error", err.message);
                    /* istanbul ignore else */
                    if (!this.connected) reject(err);
                }).bind(this));
            });
        },        
        
        async disconnect () {
            return new Promise((resolve) => {
                /* istanbul ignore else */
                if (this.client && this.connected) {
                    this.client.on("close", () => {
                        resolve();
                    });
                    this.client.disconnect();
                } else {
                    resolve();
                }
            });
        }
        
    },

    /**
     * Service created lifecycle event handler
     */
    async created() { },

    /**
     * Service started lifecycle event handler
     */
    async started() {

        // connect to redis db
        await this.connect();
        
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {
        
        // disconnect from redis db
        await this.disconnect();
        
    }
    
};