/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const { Kafka, logLevel } = require("kafkajs");
const uuidV4 = require("uuid/v4");
const mapper = require("./util/mapper");
const { FlowUnvalidTask, FlowSubscriptionFailedAuthorization, FlowSubscriptionRuleNoMatch, FlowUnvalidMapping } = require("./util/errors");

module.exports = {
	// After broker is created
    async created(broker) {

        // set emitter options
        broker.emitter = {
            clientId: uuidV4(),
            brokers: ( this.options.emitter && this.options.emitter.brokers ) ? this.options.emitter.brokers : ["localhost:9092"],
            ssl: ( this.options.emitter && this.options.emitter.ssl ) ? this.options.emitter.ssl : null,
            sasl: ( this.options.emitter && this.options.emitter.sasl ) ? this.options.emitter.sasl : null,
            topic: ( this.options.emitter && this.options.emitter.topic ) ? this.options.emitter.topic : "flow.events",
            // Map kafkajs log to service logger
            // serviceLogger = kafkaLogLevel => ({ namespace, level, label, log }) ...
            serviceLogger: () => ({ namespace, level, log }) => {
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
            },
            defaults: {
                connectionTimeout: 1000,
                retry: {
                    initialRetryTime: 100,
                    retries: 8
                }
            },
            // Array with local service names
            services: [],
            // Stack with running consumers
            consumers: [],
            // Open events
            open: 0
        };

				// Create the client with the broker list
        broker.emitter.kafka = await new Kafka({
            clientId: broker.emitter.clientId,
            brokers: broker.emitter.brokers,
            logLevel: logLevel.INFO,
            logCreator: this.emitter.serviceLogger,
            ssl: broker.emitter.ssl || null,     // refer to kafkajs documentation
            sasl: broker.emitter.sasl || null,   // refer to kafkajs documentation
            connectionTimeout: broker.emitter.defaults.connectionTimeout,
            retry: broker.emitter.defaults.retry
        });
        
        broker.emitter.eachEvent = function (broker) {
            // available parameters { topic, partition, message }
            return async ({ topic, message }) => {
                let offset = message.offset.toString();
                try {
                    let content = JSON.parse(message.value.toString());
                    
                    broker.logger.info(`Task topic ${topic} offset ${offset} accepted`, { value: content });

                    /* 
                     * validate content
                     */
                    let task, event;
                    try {
                        event = {
                            payload: content.event.payload,
                            contextId: content.event.contextId,
                            correlationId: content.event.correlationId
                        };
                        task = {
                            process: content.task.process,
                            step: content.task.step,
                            service: content.task.service,
                            action: content.task.action,
                            map: content.task.map,
                            meta: {
                                caller: {
                                    type: content.task.caller.type,
                                    id: content.task.caller.id
                                },                                
                                onDone: {
                                    event: (content.onDone && content.onDone.event) ? content.onDone.event : `${content.task.action}.done`
                                },
                                onError: {
                                    event: (content.onError && content.onError.event) ? content.onError.event : `${content.task.action}.error`,
                                }
                            }
                        };
                    } catch (err) {
                        throw new FlowUnvalidTask("unvalid task", { task: content });
                    }
                    
                    /*
                     *  Check & Update Context
                     */
                    let context;
                    context = event.payload;
                    // TODO call flow.store.get with key = contextId
                    
                    /*
                     *  Map parameter
                     */
                    try {
                        task.params = mapper(task.map, context);
                    } catch (err) {
                        throw new FlowUnvalidMapping("unvalid task", { map: task.map });
                    }
                    
										/* 
										 * call action
										 */
                    try {
                        let res = await broker.call(`${task.service}.${task.action}`, task.params, { meta: task.meta });

                        broker.logger.debug(`Task topic ${topic} offset ${offset} executed`, { result: res });
                        
                    } catch (err) {

                        broker.logger.warn(`Call to task topic ${topic} offset ${offset} failed`, { error: err });

                        throw err;
                    }
                                        
                } catch(err) {
                    switch (err.constructor) {
                        case FlowSubscriptionFailedAuthorization: {
                            broker.logger.debug(`Task topic ${topic} offset ${offset} ignored`, {
                                error: err.name,
                                message: err.message, 
                                subscription: err.subscription,
                                value: err.content
                            });

                            //ignore this event
                            return Promise.resolve();
                        }
                        case FlowSubscriptionRuleNoMatch: {
                            broker.logger.debug(`Task topic ${topic} offset ${offset} ignored`, {
                                error: err.name,
                                message: err.message, 
                                event: err.event,
                                rule: err.rule
                            });

                            //ignore this event
                            return Promise.resolve();
                        }
                        case FlowUnvalidTask: {
                            broker.logger.info(`Task topic ${topic} offset ${offset} unvalid`, {
                                error: err.name,
                                message: err.message, 
                                task: err.task
                            });

                            //ignore this event
                            return Promise.resolve();
                        }
                        default: {
                            broker.logger.error(`Unreadable task in topic ${topic} offset ${offset}`, {
                                error: err.name,
                                message: err.message, 
                                subscription: err.subscription,
                                value: err.stack
                            });

                            return Promise.reject(err);
                        }
                    }
                }
            };
        };  
        
    },

    // Wrap local action calls (legacy middleware handler)
    localAction(handler, action) {
        return async function(ctx) {
            console.log("MW localAction is fired.", action.name);
            console.log("MW localAction META:", ctx.meta);
            try {
                let res = await handler(ctx);
                if (ctx.meta && ctx.meta.onDone && ctx.meta.onDone.event && ctx.meta.caller) {
                    let meta = ctx.meta;
                    meta.owner = meta.caller;
                    await ctx.broker.emit(ctx.meta.onDone.event, res, null, meta);
                }
                /*
                 * Store result to context
                 */
                if (res && ctx.meta && ctx.meta.context &&  ctx.meta.context.store ) {
                    //TODO call flow.store.add with key = <process>.<step> and value = res
                }
                return res;
            } catch (err) {
                if (ctx.meta && ctx.meta.onError && ctx.meta.onError.event && ctx.meta.caller) {
                    let meta = ctx.meta;
                    meta.owner = meta.caller;
                    await ctx.broker.emit(ctx.meta.onError.event, { error: err });
                }
                throw err;
            }
        };
    },

    
    // Wrap broker.createService method
    createService(next) {
        return function() {
            console.log("MW createService is fired.");
            return next(...arguments);
        };
    },

    // Wrap broker.destroyService method
    destroyService(next) {
        return function() {
            console.log("MW destroyService is fired.");
            return next(...arguments);
        };
    },

    // When event is emitted
    emit(next) {
        return async function emitter(eventName, payload, groups, meta) {            
            console.log("MW emit is fired.", eventName);

            // Check if event starts with name of local service
            let valid = this.emitter.services.reduce((result, service) => { return (eventName.startsWith(service) ? true : result);},false);
            if (valid) {
                // track open events for shutdown
                this.emitter.open++;
                
                // topic
                let topic = this.emitter.topic;
                
                // key
                let key = "";
                
                // message content
                let content = {
                    event: eventName,
                    payload: payload,
                    meta: meta || {}
                };
                content.meta.eventVersion = "1.0";
            
                // Emit event
                try {
                    await this.emitter.producer.send({
                        topic: topic,
                        messages: [
                                { key: key, value: JSON.stringify(content) }
                        ],
                    }); 
                    this.logger.debug(`Emitted event ${content.event} to topic ${topic}`, { content: content });
                } catch (err) {
                    this.logger.error(`Failed to emit event ${content.event} to topic ${topic}`, { content: content, error: err });
                    throw err;
                } finally {
                    // track open events for shutdown
                    this.emitter.open--;
                }
            }
            
            // Call default handler
            return next(eventName, payload, groups);
        };
    },

    // When broadcast event is emitted
    broadcast(next) {
        return function(eventName, payload, groups) {
            console.log("MW broadcast is fired.", eventName);
            return next(eventName, payload, groups);
        };
    },

    // When local broadcast event is emitted
    broadcastLocal(next) {
        return function(eventName, payload, groups) {
            console.log("MW broadcastLocal is fired.", eventName);
            return next(eventName, payload, groups);
        };
    },

    // After a new local service created
    serviceCreated(service) {
        console.log("MW serviceCreated is fired", service.name);
    },

    // After a local service started
    async serviceStarted(service) {
        console.log("MW serviceStarted is fired", service.name);
        this.emitter.services.push(service.name);
        let topic = service.name + ".tasks";

        
        // Ignore unvalid topic names (like internal services starting with $)
        if (/^[a-zA-Z0-9\\._\\-]*$/.test(topic)) {
            try {
                let consumer = this.emitter.kafka.consumer({ groupId: topic});
                let fromBeginning = true;
                
                // connect consumer and subscribe to the topic
                await consumer.connect();
                await consumer.subscribe({ topic: topic, fromBeginning: fromBeginning });
                
                // start runner
                await consumer.run({
                    //eachMessage: eachEvent(this)
                    eachMessage: this.emitter.eachEvent(this)
                });

                // don't know how to set offset ... better to start always with "fromBeginning"...consuming is quite cheap
                //await consumer.seek({ topic: topic, partition: 0, offset: 0 });
                
                // push to stack
                this.emitter.consumers.push(consumer);

                this.logger.info(`Subscription for topic '${topic}' running`, { topic: topic });

            } catch (err) {
                this.logger.error(`Subscription for topic ${topic}) failed`, { error: err });
                throw err;
            }
        }

    },

    // After a local service stopped
    serviceStopped(service) {
        console.log("MW serviceStopped is fired", service.name);
    },

    // Before broker starting
    async starting(broker) {
				// Create producer and connect
        broker.emitter.producer = await broker.emitter.kafka.producer();
        await broker.emitter.producer.connect();
        // for creation of topics
        broker.emitter.admin = await broker.emitter.kafka.admin();
        await broker.emitter.admin.connect();
        // view topics
        let topics = await broker.emitter.admin.getTopicMetadata();
        this.logger.info("Known topics on brokers " + broker.emitter.brokers.join(","), { topics: topics });
        // create topic, if not exists
        try {
            await broker.emitter.admin.getTopicMetadata({ topics: [broker.emitter.topic] });
        } catch (err) {
            try {
                let created = await broker.emitter.admin.createTopics({
                    waitForLeaders: true,
                    timeout: 5000,
                    topics: [{topic: broker.emitter.topic}]
                });
                if (created) this.logger.info("New topic created " + broker.emitter.topic);
            } catch (err) {
                this.logger.error("New topic refused " + broker.emitter.topic, err);
                //throw err;
            }
        }
        // check again
        topics = await broker.emitter.admin.getTopicMetadata();
        this.logger.info("Known topics on brokers " + broker.emitter.brokers.join(","), { topics: topics });
        console.log(topics);

        this.logger.info("Producer connected to kafka brokers " + broker.emitter.brokers.join(","));
    },

    // After broker started
    /*
    started(broker) {
        console.log("MW started is fired.");
    },
    */

    // Before broker stopping
    async stopping(broker) {
        
        // Stop consumers
        try {
            await Promise.all(this.emitter.consumers.map(consumer=> consumer.disconnect()));
            this.logger.info("All consumers disconnected");
        } catch (err) {
            this.logger.error("Failed to disconnect consumers", err);
        }
        
        // Wait for empty queue
        async function check(){
            if (broker.emitter.open <= 0) return true;
            else { 
                this.logger.warn("Event queue not empty... waiting", {queue: broker.emitter.open});
                throw "Retry";
            }
        }
        async function retry(fn, retriesLeft = 5, interval = 1000, exponential = false) {
            try {
                const val = await fn();
                return val;
            } catch (error) {
                if (retriesLeft) {
                    await new Promise(r => setTimeout(r, interval));
                    return retry(fn, retriesLeft - 1, exponential ? interval * 2 : interval, exponential);
                } else throw new Error("Max retries reached");
            }
        }
        try {
            await retry(check);
        } catch (err) {
            broker.logger.error("Events queue was not empty (potentially lost events!)", { queue: broker.emitter.open, error: err });
        }

        // Disconnect producer and admin
        if (broker.emitter.producer) await broker.emitter.producer.disconnect();
        if (broker.emitter.admin) await broker.emitter.admin.disconnect();
        this.logger.info("Producer disconnectied from kafka brokers " + broker.emitter.brokers.join(","));
    },

    // After broker stopped
    /*
    stopped(broker) {
        console.log("MW stopped is fired.");
    },
    */
};