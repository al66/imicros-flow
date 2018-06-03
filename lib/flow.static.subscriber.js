/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const { Kafka, logLevel } = require("kafkajs");
const uuidV4 = require("uuid/v4");
const Constants = require("./util/constants");
const mapper = require("./util/mapper");
const { FlowSubscriptionFailedAuthorization, FlowSubscriptionRuleNoMatch } = require("./util/errors");

module.exports = {
    name: "flow.static.subscriber",
    
		/**
		 * Service settings
		 */
    settings: {
				/*
				topics: {
						events: "events"
				}
				subscriptions: [
						{
								event: "user.created",
								params: {
										userId: payload.id
								},
								action: "user.requestConfirmation",
								payload: {

								}
						}
				]
				*/
    },

		/**
		 * Service metadata
		 */
    metadata: {},

		/**
		 * Service dependencies
		 */
    dependencies: ["flow.publisher"],	

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

                let consumer = this.kafka.consumer({ groupId: subscription.id });

								//subscription.consumer.on(subscription.consumer.events.COMMIT_OFFSETS,() => {console.log("Consumer:COMMIT_OFFSETS")})
								//subscription.consumer.on(subscription.consumer.events.HEARTBEAT,() => {console.log("Consumer:HEARTBEAT")})

								// connect consumer and subscribe to the topic
                await consumer.connect();
                await consumer.subscribe({ topic: subscription.topic, fromBeginning: subscription.fromBeginning });
								// don't know how to set offset ... better to start always with "fromBeginning"...consuming is quite cheap
								//await this.consumer.seek({ topic: this.topics.events, partition: 0, offset: 0 })

								// start runner
                await consumer.run({
                    eachMessage: this.eachEvent(JSON.parse(JSON.stringify(subscription))),
                });

								// memorize consumer for cleaning up on service stop
                this.consumers.push(consumer);

                this.logger.debug(`Subscription for topic '${this.topics.events}' running`, { subscription: subscription });

            } catch (e) {
                this.logger.warn(`Subscription for topic ${this.topics.events}) failed`);
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
                    let params, result;

										/* 
										 * check against subscription rule (wildcards possible) and check authorization
										 */
                    if (!content.event || !this.matchRule(content.event, subscription.event)) {
                        throw new FlowSubscriptionRuleNoMatch("not subscribed", { event: content.event, rule: subscription.event });
                    }

										// for non-public events a non-static subscriber must have access
                    if (content.owner) {

												// access groups in subscription available?
                        if (!subscription.meta || !subscription.meta.access || !Array.isArray(subscription.meta.access)) {
                            throw new FlowSubscriptionFailedAuthorization("missing access groups", { subscription, content });
                        }

												// no access?
                        if (subscription.meta.access != Constants.STATIC_GROUP && subscription.meta.access.indexOf(content.owner) < 0) {
                            throw new FlowSubscriptionFailedAuthorization("missing authorization", { subscription, content });
                        }
                        
                    }
                    this.logger.debug(`Event topic ${topic} offset ${offset} accepted`, {
                        subscription: subscription,
                        value: content
                    });

										/* 
										 * call the given subscription action
										 */
                    if (subscription.action) {
                        params =  subscription.params ? subscription.params : content.payload;
                        if (subscription.params) {
                            try {
                                params =  mapper(params, { meta: content.meta, payload: content.payload });
                            } catch (err) {
                                this.logger.debug("Error mapping parameters", { params: subscription.params, error: err });
                                //err = null;
                            }
                        }
                        result = await this.broker.call(subscription.action, params, { meta: content.meta });
                        this.logger.debug(`Event topic ${topic} offset ${offset} action called`, {
                            action: subscription.action,
                            result: result
                        });
                    }

										/* 
										 * emit terminated event with result of the action
										 */
                    if (subscription.emit) {
                        let payload =  subscription.payload ? subscription.payload : result;
                        if (subscription.payload) {
                            try {
                                payload =  mapper(payload, { meta: content.meta, payload: content.payload, result: result });
                            } catch (err) {
                                this.logger.debug("Error mapping parameters", { payload: subscription.payload, error: err });
                                //err = null;
                            }
                        }
                        params = {
                            event: subscription.emit,
                            payload: payload,
                        };
                        await this.broker.call("flow.publisher.emit", params, { meta: content.meta });
                        this.logger.debug(`Event topic ${topic} offset ${offset} terminated event emitted`, {
                            event: subscription.emit,
                            payload: payload,
                            meta: content.meta
                        });
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
                            return Promise.reject();
                        }
                    }
                }
            };
        },
        
				/**
				 * Check event name against subscription rule with wildcards allowed
				 * 
				 * @param {String} event name 
				 * @param {String} subscription rule with wildcards - e.g. user.*, user.*.log, user.** 
				 * 
				 * @returns {Boolean} result
				 */
        matchRule(str, rule) {
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

				// Create the client with the broker list
        this.kafka = new Kafka({
            clientId: this.clientId,
            brokers: this.brokers,
            logLevel: 5, //logLevel.DEBUG,
            logCreator: this.serviceLogger
        });


        this.topics = {
            events: this.settings.topics ? this.settings.topics.events || "events" : "events"
        };

        this.consumers = [];
        
    },

		/**
		 * Service started lifecycle event handler
		 */
    async started() {

				// Start static subscriptions
        if (this.settings.subscriptions && Array.isArray(this.settings.subscriptions) ) {
            await Promise.all(this.settings.subscriptions.map(async subscription => {

								// if no id is given, create a new one - in this case emitted events can be processed multiple times
                subscription.id = subscription.id || uuidV4();
                subscription.topic = this.topics.events;

								// Static descriptions have access to events all emitted events
                subscription.meta = {
                    access: [ Constants.STATIC_GROUP ]
                };
                await this.subscribe(subscription);
            }));
        }

    },

		/**
		 * Service stopped lifecycle event handler
		 */
    async stopped() {

        try {
            await Promise.all(this.consumers.map(consumer => consumer.disconnect()));
            this.logger.info("All consumers disconnected");
        } catch (err) {
            this.logger.err("Failed to disconnect consumers", err);
        }

    }

};