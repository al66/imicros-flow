/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const { Kafka, logLevel } = require("kafkajs");
const { FlowPublishFailedAuthorization } = require("./util/errors");
const uuidV4 = require("uuid/v4");

module.exports = {
    name: "flow.publisher",
    
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

        emit: {
            params: {
                topic: { type: "string", optional:true },
                event: { type: "string" },
                payload: { type: "any" },
                owner: { type: "string", optional:true }
            },
            async handler(ctx) {
                let topic = ctx.params.topic || this.defaultTopic;
                let content = {
                    event: ctx.params.event,
                    payload: ctx.params.payload,
                };
                
                // Add context meta
                content.meta = ctx.meta;
                //  if authenticated user: user = owner
                if ( ctx.meta.user && ctx.meta.user.id ) content.owner = ctx.meta.user.id;
                //  if a group is choosen: group = owner
                if ( ctx.meta.groupId ) content.owner = ctx.meta.groupId;
                //  or take owner from parameters
                if (ctx.params.owner) {
                    if (!ctx.meta.access || ctx.meta.access.indexOf(ctx.params.owner) < 0) {
                        throw new FlowPublishFailedAuthorization("not authenticated for group", { group: ctx.params.owner, access: ctx.meta.access });
                    }
                    content.owner = ctx.params.owner;
                }
                
                // Emit event
                try {
                    await this.flowEmit({ topic: topic, content: content }); 
                    return { success: "event stored", topic: topic, content: content };
                } catch (err) {
                    this.logger.error(`Failed to emit event ${content.event} to topic ${topic}`, { content: content, error: err });
                    throw err;
                }
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
        
        async flowEmit ({topic, content}) {
            return this.producer.send({
                topic: topic,
                messages: [
                        { key: "tbd", value: JSON.stringify(content) }
                ],
            });
        }
        
    },

    /**
     * Service created lifecycle event handler
     */
    created() {
        
        this.clientId = this.name + uuidV4(); 
        this.brokers = this.settings.brokers || ["localhost:9092"];
        
        // serviceLogger = kafkaLogLevel => ({ namespace, level, label, log }) ...
        this.serviceLogger = () => ({ level, log }) => {
            switch(level) {
                case logLevel.ERROR:
                case logLevel.NOTHING:
                    return this.logger.error("namespace:" + log.message, log);
                case logLevel.WARN:
                    return this.logger.warn("namespace:" + log.message, log);
                case logLevel.INFO:
                    return this.logger.info("namespace:" + log.message, log);
                case logLevel.DEBUG:
                    return this.logger.debug("namespace:" + log.message, log);
            }
        };
        
        this.defaults = {
            connectionTimeout: 1000,
            retry: {
                initialRetryTime: 100,
                retries: 8
            }
        };
				// Create the client with the broker list
        this.kafka = new Kafka({
            clientId: this.clientId,
            brokers: this.brokers,
            logLevel: 5, //logLevel.DEBUG,
            logCreator: this.serviceLogger,
            ssl: this.settings.ssl || null,     // refer to kafkajs documentation
            sasl: this.settings.sasl || null,   // refer to kafkajs documentation
            connectionTimeout: this.settings.connectionTimeout ||  this.defaults.connectionTimeout,
            retry: this.settings.retry || this.defaults.retry
        });

        this.defaultTopic = this.settings.topic || "events";
        
    },

	/**
	 * Service started lifecycle event handler
	 */
    async started() {
        
        this.producer = await this.kafka.producer();
        await this.producer.connect();
        this.logger.info("Producer connected to kafka brokers " + this.brokers.join(","));
        
    },

	/**
	 * Service stopped lifecycle event handler
	 */
    async stopped() {
        
        await this.producer.disconnect();
        this.logger.info("Producer disconnectied");
        
    }
};