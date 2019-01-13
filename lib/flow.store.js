/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const Redis = require("ioredis");

module.exports = {
    name: "flow.store",
    
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
    actions: {
        
				/**
				 * Add payload to context 
				 * 
				 * @param {String} contextId - uuid
				 * @param {String} key  -   PARENT = ContextId of calling process   or
         *                          START = inital event   or
         *                          process step in format <process>.<step>.<cycle>
				 * @param {String} value -  Key PARENT: ContextId
         *                          Key START: payload of initial event
         *                          Key processs step: result of the executed process stap  
				 * 
				 * @returns {Boolean} result
				 */
        add: {
            params: {
                contextId: { type: "string" },
                key: { type: "string" },
                value: { type: "any" }
            },
            async handler(ctx) {
                //HSET
                try {
                    await this.client.hset(ctx.params.contextId, ctx.params.key, this.encode(ctx.params.value));
                    return true;
                } catch (err) {
                    this.logger.error("Redis redis error", err.message);
                }
                return false;
            }
        },
        
				/**
				 * Get whole context 
				 * 
				 * @param {String} contextId
				 * 
				 * @returns {Object} context
				 */
        get: {
            params: {
                contextId: { type: "string" }
            },
            async handler(ctx) {
                // HGETALL
                try {
                    let values = await this.client.hgetall(ctx.params.contextId);
                    for (let key in values) {
                        if (values.hasOwnProperty(key)) {
                            values[key] = this.decode(values[key]);
                        }
                    }
                    
                    return values;
                } catch (err) {
                    this.logger.error("Redis redis error", err.message);
                }
                return {};
            }
        },
        
				/**
				 * Delete key again from context 
				 * 
				 * @param {String} contextId
				 * @param {String} key
				 * 
				 * @returns {Boolean} result
				 */
        rollback: {
            params: {
                contextId: { type: "string" },
                key: { type: "string" }
            },
            async handler(ctx) {
                // HDEL 
                try {
                    await this.client.hdel(ctx.params.contextId, ctx.params.key);
                    return true;
                } catch (err) {
                    this.logger.error("Redis redis error", err.message);
                }
                return false;
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
    methods: {
        
        encode (value) {
            let val = {};
            if (Buffer.isBuffer(value)) {
                val.type = "buffer";
                val.value = value.toString("base64");
            } else {
                switch (typeof value) {
                    case "number":
                        val.type = "number";
                        val.value = value.toString();
                        break;
                    case "string":
                        val.type = "string";
                        val.value = value.toString();
                        break;
                    case "function":
                        val.type = "function";
                        val.value = value.toString();
                        break;
                    case "boolean":
                        val.type = "boolean";
                        val.value = value.toString();
                        break;
                    case "object":
                        val.type = "object";
                        val.value = JSON.stringify(value);
                        break;
                }
            } 
            return JSON.stringify(val);
        },
        
        decode (value) {
            let val = JSON.parse(value);
            let decoded = val.value;
            switch (val.type) {
                case "buffer":
                    decoded = Buffer.from(val.value, "base64");
                    break;
                case "number":
                    decoded = parseFloat(val.value);
                    break;
                case "function":
                    decoded = new Function("return " + val.value)();
                    break;
                case "boolean":
                    decoded = (val.value === "true");
                    break;
                case "object":
                    decoded = JSON.parse(val.value);
                    break;
            }
            return decoded;  
        },
        
        connect () {
            return new Promise((resolve, reject) => {
                let redisOptions = this.settings.redis || {};
                this.client = new Redis(redisOptions);

                this.client.on("connect", (() => {
                    this.connected = true;
                    this.logger.info("Connected to Redis");
                    resolve();
                }).bind(this));

                this.client.on("close", (() => {
                    this.connected = false;
                    this.logger.warn("Disconnected from Redis");
                }).bind(this));

                this.client.on("error", ((err) => {
                    this.connected = false;
                    this.logger.error("Redis redis error", err.message);
                    this.logger.debug(err);
                    if (!this.connected) reject(err);
                }).bind(this));
            });
        },
        
        async disconnect () {
            return new Promise((resolve) => {
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
    created() {},

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