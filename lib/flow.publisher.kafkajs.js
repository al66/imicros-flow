/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const { Kafka, logLevel } = require("kafkajs");

module.exports = {
    name: "flow.publisher",
    
	/**
	 * Service settings
	 */
    settings: {
        /*
        topics: {
            events: "events"
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
                event: { type: "string" },
                payload: { type: "any" },
                owner: { type: "string", optional:true }
            },
            async handler(ctx) {
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
                        return { error: "not authenticated for group " + ctx.params.owner };
                    }
                    content.owner = ctx.params.owner;
                }
                
                // Emit event
                try {
                    await this.flowEmit(content); 
                    return { success: "event stored", content: content };
                } catch (err) {
                    this.logger.error(`Failed to emit event ${content.event} to topic ${this.topics.events}`, { content: content, error: err });
                    return { error: "failed to emit event" };
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
        
        async flowEmit (content) {
            return this.producer.send({
                topic: this.topics.events,
                messages: [
                        { value: JSON.stringify(content) }
                ],
            });
        }
        
    },

	/**
	 * Service created lifecycle event handler
	 */
    created() {
        
        this.clientId = this.name + Date.now(); 
        this.brokers = this.settings.brokers || ["localhost:9092"];
        
        this.serviceLogger = kafkalogLevel => ({ namespace, level, label, log }) => {
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
        
        // Create the client with the broker list
        this.kafka = new Kafka({
            clientId: this.clientId,
            brokers: this.brokers,
            logLevel: logLevel.DEBUG,
            logCreator: this.serviceLogger,
            connectionTimeout: this.settings.connectionTimeout ||  1000
        });

        this.topics = {
            events: this.settings.topics ? this.settings.topics.events || "events" : "events"
        };
        
    },

	/**
	 * Service started lifecycle event handler
	 */
    async started() {
        
        this.producer = await this.kafka.producer();
        await this.producer.connect();
        
    },

	/**
	 * Service stopped lifecycle event handler
	 */
    async stopped() {
        
        await this.producer.disconnect();
        this.logger.info("Producer disconnectied");
        
    }
};