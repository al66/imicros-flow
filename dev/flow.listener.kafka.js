/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const { Kafka, logLevel } = require("kafkajs");
const uuidV4 = require("uuid/v4");
const { FlowSubscriptionFailedAuthorization, FlowSubscriptionRuleNoMatch,FlowUnvalidEvent } = require("./util/errors");

module.exports = {
    name: "flow.listener",
    
		/**
		 * Service settings
		 */
    settings: {
				/*
				topics: {
						events: "<service>.events",
            tasks: "<service>.tasks"
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
    dependencies: ["flow.query"],	

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
				 * Subscribe 
				 *     - Starts a consumer for the subscription 
				 * 
				 * @param {Object} subscription 
				 * 
				 */
        async subscribe (subscription) {
            try {

                this.consumer = this.kafka.consumer({ groupId: subscription.id });

								// connect consumer and subscribe to the topic
                await this.consumer.connect();
                await this.consumer.subscribe({ topic: subscription.topic, fromBeginning: subscription.fromBeginning });
								// don't know how to set offset ... better to start always with "fromBeginning"...consuming is quite cheap
								//await this.consumer.seek({ topic: this.topics.events, partition: 0, offset: 0 })

								// start runner
                await this.consumer.run({
                    eachMessage: this.eachEvent(JSON.parse(JSON.stringify(subscription))),
                });

                this.logger.debug(`Subscription for topic '${subscription.topic}' running`, { subscription: subscription });

            } catch (e) {
                this.logger.warn(`Subscription for topic ${subscription.topic}) failed`);
                throw e;
            }
        },

				/**
				 * Event handler 
				 *     - checks event name against subscription rule
				 *     - checks access authorization for non-public events (owner is set)
				 *     - calls the given action in the subsription
				 * 
				 * @param {Object} subscription 
				 * 
				 * @returns {Boolean} result
				 */
        eachEvent (subscription) {
            // available parameters { topic, partition, message }
            return async ({ topic, message }) => {

                let offset = message.offset.toString();
                try {

                    let content = JSON.parse(message.value.toString());
                    
                    // message content: 
                    //    { event, service, owner, process, step, payload, correlationId }
                    //      process & step is set only in case of flow.worker events
                    //      correlationId is initialized and set by flow.listener
                    
										/* 
										 * check against subscription rule (wildcards possible)
										 */
                    /*
                    if (!content.event || !this.matchRule(content.event, subscription.event)) {
                        throw new FlowSubscriptionRuleNoMatch("not subscribed", { event: content.event, rule: subscription.event });
                    }
                    */

                    this.logger.debug(`Event topic ${topic} offset ${offset} accepted`, {
                        subscription: subscription,
                        value: content
                    });

                    /* 
                     * validate content
                     */
                    let event;
                    try {
                        event = {
                            name: content.event,
                            offset: offset,
                            payload: content.payload,
                            owner: content.meta.owner,
                            process: content.meta.process,
                            step: content.meta.step,
                            contextId: content.meta.contextId,
                            correlationId: content.meta.correlationId
                        };
                    } catch (err) {
                        throw new FlowUnvalidEvent("unvalid event", { event: content });
                    }
                    //TODO !!!!
                    
										/* 
										 * get next tasks and schedule tasks
										 */
                    let params = {
                        event: {
                            name: event.name,
                            owner: event.owner,
                            process: event.process,
                            step: event.step
                        }
                    };
                    let next = await this.broker.call("flow.query.next", params);
                    if (Array.isArray(next)) {
                        
                        let tasks = [];

                        next.forEach(item => {
                            
                            /* 
                             * check authorization
                             */
                            // TODO!!!!
                            /*
                            // no access?
                            if (...) {
                                throw new FlowSubscriptionFailedAuthorization("missing authorization", { item, content });
                            }
                            */
                                                                                
                            // {version, event, task: { service, action, map, caller }, onDone, onError, correlationId }
                            let task = {
                                version: "1.0",
                                topic: item.task.service + ".tasks",
                                event: {                            // for error handling
                                    topic: topic,
                                    name: event.name,
                                    owner: event.owner,
                                    process: event.process,
                                    step: event.step,
                                    offset: offset,
                                    payload: event.payload,
                                    contextId: event.contextId,
                                    correlationId: event.correlationId
                                },
                                task: {
                                    process: item.task.process,
                                    step: item.task.step,
                                    service: item.task.service,
                                    action: item.task.action,
                                    map: item.task.map || {},
                                    caller: item.task.owner
                                },
                                onDone: {
                                    event: item.onDone.event
                                },
                                onError: {
                                    event: item.onError.event
                                }
                            };
                            this.logger.info(`Build task for event ${event.name} offset ${offset}`, {
                                task: task
                            });
                            tasks.push(task);
                        });
                        
                        if (tasks.length > 0)  await this.emit({ tasks: tasks });
                    }
                                        
                } catch(err) {
                    switch (err.constructor) {
                        case FlowSubscriptionFailedAuthorization: {
                            this.logger.debug(`Event topic ${topic} offset ${offset} ignored`, {
                                error: err.name,
                                message: err.message, 
                                subscription: err.subscription,
                                value: err.content
                            });

                            //ignore this event
                            return Promise.resolve();
                        }
                        case FlowSubscriptionRuleNoMatch: {
                            this.logger.debug(`Event topic ${topic} offset ${offset} ignored`, {
                                error: err.name,
                                message: err.message, 
                                event: err.event,
                                rule: err.rule
                            });

                            //ignore this event
                            return Promise.resolve();
                        }
                        default: {
                            this.logger.error(`Unreadable event in topic ${topic} offset ${offset}`, err);

                            //return Promise.reject(err);
                            return Promise.resolve(err);
                        }
                    }
                }
            };
        },
        
        async emit ({tasks}) {

            let batches = tasks.reduce((batch,task) => { 
                batch.indexOf(task.topic) >= 0 ? batch[task.topic].push(task) : batch[task.topic] = [task];
                return batch;
            },[]);
            
            for (let key in batches) {
                if (key === "length" || !batches.hasOwnProperty(key)) continue;
                let tasks = batches[key];
                let topic = key;
                
                if (this.existingTopics.indexOf(topic)<0) {
                    // create topic, if not exists
                    try {
                        await this.admin.getTopicMetadata({ topics: [topic] });
                    } catch (err) {
                        try {
                            let created = await this.admin.createTopics({
                                waitForLeaders: true,
                                timeout: 5000,
                                topics: [{topic: topic}]
                            });
                            if (created) this.logger.info("New topic created " + topic);
                            this.existingTopics.push(topic);
                        } catch (err) {
                            this.logger.error("New topic refused " + topic, err);
                            //throw err;
                        }
                    }
                    this.existingTopics.push(topic);
                }

                // Convert json to strings
                let event = tasks[0].event;
                let offset = tasks[0].event.offset; 
                let messages = tasks.map(task => { return { key: "", value: JSON.stringify(task) };});
                try {
                    await this.producer.send({
                        topic: topic,
                        messages: messages,
                    });
                    this.logger.info(`Scheduled tasks emitted for consumed event topic ${event.topic} offset ${offset}`, {
                        topic: topic,
                        event: event,
                        tasks: tasks
                    });
                } catch (err) {
                    this.logger.error(`Failed to emit event for consumed event topic ${event.topic} offset ${offset}`, {
                        event: event,
                        messages: messages,
                        err: err
                    });
                }

            }
        },
        
				/**
				 * Check event name against subscription rule with wildcards allowed
				 * 
				 * @param {String} event name 
				 * @param {String} subscription rule with wildcards - e.g. user.*, user.*.log, user.** 
				 * 
				 * @returns {Boolean} result
				 */
        matchRule (str, rule) {
						// escape dots for regex
            let path = rule.split(".").join("\\.");

						// either wildcard with ** for anything in this path or with * 
            let exp = rule.match(/.*\*\*.*/) ? path.split("**").join(".*") : path.split("*").join("\\w*");
            return new RegExp("^" + exp + "$").test(str);
        }
        
    },

		/**
		 * Service created lifecycle event handler
		 */
    created() {
        
        this.clientId = this.name + uuidV4(); 
        this.brokers = this.settings.brokers || ["localhost:9092"];

				// Map kafkajs log to service logger
        // serviceLogger = kafkaLogLevel => ({ namespace, level, label, log }) ...
        this.serviceLogger = () => ({ namespace, level, log }) => {
            switch(level) {
                case logLevel.ERROR:
                case logLevel.NOTHING:
                    return this.logger.error("KAFKAJS: " + namespace + log.message, log);
                case logLevel.WARN:
                    return this.logger.warn("KAFKAJS: " + namespace + log.message, log);
                case logLevel.INFO:
                    return this.logger.info("KAFKAJS: " + namespace + log.message, log);
                case logLevel.DEBUG:
                    return this.logger.debug("KAFKAJS: " + namespace + log.message, log);
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

        this.topics = {
            events: this.settings.topics ? this.settings.topics.events || "external.events" : "external.events",
            tasks: this.settings.topics ? this.settings.topics.tasks || "external.tasks" : "external.tasks"
        };

        this.consumer = null;
        this.existingTopics = [];
        
    },

		/**
		 * Service started lifecycle event handler
		 */
    async started() {
        
        // Start producer
        this.producer = await this.kafka.producer();
        await this.producer.connect();
        
        // for creation of topics
        this.admin = await this.kafka.admin();
        await this.admin.connect();
        
				// Start subscription
        let subscription = {
            id: this.topics.events,         // Currently equal topic (all consumers consume from the same topic queue)
            topic: this.topics.events,
            event: "*"                      // Currently consume all events
        };
        await this.subscribe(subscription);
    },

		/**
		 * Service stopped lifecycle event handler
		 */
    async stopped() {

        try {
            if (this.consumer) await this.consumer.disconnect();
            this.logger.info("Consumer is disconnected");
        } catch (err) {
            this.logger.error("Failed to disconnect consumer", err);
        }
    
        await this.producer.disconnect();
        await this.admin.disconnect();
        this.logger.info("Producer disconnectied");
    }

};