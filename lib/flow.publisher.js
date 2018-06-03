/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

// due to performance issues - kafkajs has higher through put for the consumer but about 30% lower speed as producer 
// at all the perfomance is low: ~375 rps emit / ~350 rps consume + call action + produce
// native checks with native usage (w/o moleculer):
// kafka-node ~420 rps producing / ~1,17k rps consuming 
// kafkajs ~290 rps producing / ~3,7k rps consuming 

let kafka, HighLevelProducer;
let kafkaLogging = require("kafka-node/logging");
const { FlowPublishFailedAuthorization } = require("./util/errors");

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
                        throw new FlowPublishFailedAuthorization("not authenticated for group", { group: ctx.params.owner, access: ctx.meta.access });
                    }
                    content.owner = ctx.params.owner;
                }
                
                // Emit event
                try {
                    await this.flowEmit(content); 
                    return { success: "event stored", content: content };
                } catch (err) {
                    this.logger.error(`Failed to emit event ${content.event} to topic ${this.topics.events}`, { content: content, error: err });
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
        
        async flowEmit (content) {
    
          //Send payload to Kafka
            await new Promise((resolve, reject) => {
                if (!this.connected) reject(new Error("lost connection"));

              // Create a new payload
                let payload = [{
                    topic: this.topics.events,
                    messages: JSON.stringify(content),
                    attributes: 1 /* Use GZip compression for the payload */
                }];

                this.producer.send(payload, function(error, result) {
                    if (error) {
                        reject(error);
                    } else {
                        let formattedResult = result[0];
                        resolve(formattedResult);
                    }
                });
            });

        }
        
    },

	/**
	 * Service created lifecycle event handler
	 */
    created() {
        
        this.clientId = this.name + Date.now(); 
        this.brokers = this.settings.brokers || ["localhost:9092"];
        
        let serviceLogger = () => {
            return {
                debug: this.logger.debug,
                info: this.logger.info,
                warn: this.logger.warn,
                error: this.logger.error
            };
        };
        kafkaLogging.setLoggerProvider(serviceLogger);

        // Must be required after custom logger is set
        kafka = require("kafka-node");
        HighLevelProducer = kafka.HighLevelProducer;
        
        this.topics = {
            events: this.settings.topics ? this.settings.topics.events || "events" : "events"
        };
        
    },

	/**
	 * Service started lifecycle event handler
	 */
    async started() {
        
        await new Promise((resolve, reject) => {
            // Create the client with the broker list
            this.client = new kafka.KafkaClient({
                clientId: this.clientId,
                kafkaHost: this.brokers.join(","),
                sessionTimeout: this.settings.connectionTimeout ||  1000,
                spinDelay: 100,
                retries: 2
            }); 
            this.client.on("error", function(error) {
                this.connected = false;
                this.logger.error("KAFKA-NODE: " + "client error", error);
                reject();
            });
            this.producer = new HighLevelProducer(this.client);
            this.producer.on("error", function(error) {
                this.connected = false;
                this.logger.error("KAFKA-NODE: " + "producer error", error);
                reject();
            });
            this.producer.on("ready", async () => {
                this.connected = true;
                this.logger.info("Producer connected");
                resolve();
            });
        });
        
    },

	/**
	 * Service stopped lifecycle event handler
	 */
    async stopped() {
        
        await this.client.close();
        this.logger.info("Producer disconnected");
        
    }
};