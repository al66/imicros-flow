/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const { Kafka, logLevel } = require('kafkajs')
const uuidV4 = require('uuid/v4');
const Constants = require("./util/constants");
const mapper = require("./util/mapper");
const { FlowSubscriptionFailedAuthorization, FlowSubscriptionRuleNoMatch } = require('./util/errors')

module.exports = {
	name: "flow.subscriber",
    
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
	//dependencies: [],	

	/**
	 * Actions
	 */
	actions: {

        subscribe: {
            params: {
                event: { type: "string" },
                params: { type: "any", optional: true },
                action: { type: "string" },
                payload: { type: "any", optional: true }
            },
            async handler(ctx) {
                let subscription = {
                    id:  uuidV4(),
                    meta: ctx.meta,
                    event: ctx.params.event,
                    params: ctx.params.params,
                    action: ctx.params.action,
                    payload: ctx.params.payload
                }
                try {
                    await this.subscribe(subscription)
                    return { success: "Subscription stored", subscription: subscription }
                } catch (err) {
                    return { error: "Failed to store subscription" }  
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
        
        async subscribe (subscription) {
            subscription.topic = this.topics.events;
            try {
                subscription.consumer = this.kafka.consumer({ groupId: subscription.id })
                //subscription.consumer.on(subscription.consumer.events.COMMIT_OFFSETS,() => {console.log("Consumer:COMMIT_OFFSETS")})
                //subscription.consumer.on(subscription.consumer.events.HEARTBEAT,() => {console.log("Consumer:HEARTBEAT")})
                await subscription.consumer.connect()
                //await subscription.consumer.subscribe({ topic: this.topics.events, fromBeginning: true })
                await subscription.consumer.subscribe({ topic: subscription.topic })
                await subscription.consumer.run({
                    eachMessage: this.eachEvent(subscription),
                })
                this.logger.info(`Subscription for topic '${this.topics.events}' running`, { subscription: subscription });
                // don't know how to set offset ... better to start always with "fromBeginning"...consuming is quite cheap
                //await this.consumer.seek({ topic: this.topics.events, partition: 0, offset: 0 })
                this.subscriptions.push(subscription)
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
            return async ({ topic, partition, message }) => {
                let offset = message.offset.toString();
                try {
                    let content = JSON.parse(message.value.toString());

                    // check against subscription rule (wildcards possible)
                    if (!content.event || !this.matchRule(content.event, subscription.event)) {
                        throw new FlowSubscriptionRuleNoMatch("not subscribed", { event: content.event, rule: subscription.event })
                    }
                        
                    // for non-public events a non-static subscriber must have access
                    if (content.owner) {

                        // access groups in subscription available?
                        if (!subscription.meta || !subscription.meta.access || !Array.isArray(subscription.meta.access)) {
                            throw new FlowSubscriptionFailedAuthorization("missing access groups", { subscription, content })
                        }

                        // no access?
                        if (subscription.meta.access != Constants.STATIC_GROUP && subscription.meta.access.indexOf(content.owner) < 0) {
                            throw new FlowSubscriptionFailedAuthorization("missing authorization", { subscription, content })
                        }
                    }
                    this.logger.info(`Event topic ${topic} offset ${offset} accepted`, {
                        subscription: subscription,
                        value: content
                    })

                    // call the given subscription action
                    let result = await this.callAction(subscription, content); 

                    // emit terminated event with result of the action
                    await this.emitTerminated(subscription, result);
                        
                } catch(err) {
                    switch (err.constructor) {
                        case FlowSubscriptionFailedAuthorization: {
                                this.logger.info(`Event topic ${topic} offset ${offset} ignored`, {
                                    error: err.name,
                                    message: err.message, 
                                    subscription: err.subscription,
                                    value: err.content
                                })

                                //ignore this event
                                return Promise.resolve()
                            }
                        case FlowSubscriptionRuleNoMatch: {
                                this.logger.info(`Event topic ${topic} offset ${offset} ignored`, {
                                    error: err.name,
                                    message: err.message, 
                                    event: err.event,
                                    rule: err.rule
                                })

                                //ignore this event
                                return Promise.resolve()
                        }
                        default: {
                            this.logger.error(`Unreadable event in topic ${topic} offset ${offset}`, err);
                            return Promise.reject();
                        }
                    }
                }

            }
        },
        
        async callAction (subscription, content) {
            let params =  subscription.params ? subscription.params : content.payload;
            if (subscription.params) {
                try {
                    params =  mapper(params, { meta: content.meta, payload: content.payload });
                } catch (err) {
                    this.logger.debug(`Error mapping parameters`, { params: subscription.params, error: err })
                    err = null;
                }
            }
            try {
                return this.broker.call(subscription.action, params)
            } catch (err) {
                throw err;
            }
        },
        
        emitTerminated (subscription, result) {
            console.log("Result:", result)
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
            let path = rule.split(".").join("\\.")

            // either wildcard with ** for anything in this path or with * 
            let exp = rule.match(/.*\*\*.*/) ? path.split("**").join(".*") : path.split("*").join("\\w*")
            return new RegExp("^" + exp + "$").test(str);
        }
        
    },

	/**
	 * Service created lifecycle event handler
	 */
	created() {
        
        this.clientId = this.name + Date.now(); 
        this.brokers = this.settings.brokers || ['localhost:9092'];
        
        // Map kafkajs log to service logger
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
        }
        
        // Create the client with the broker list
        this.kafka = new Kafka({
          clientId: this.clientId,
          brokers: this.brokers,
          logLevel: logLevel.DEBUG,
          logCreator: this.serviceLogger
        })
        

        this.topics = {
            events: this.settings.topics ? this.settings.topics.events || 'events' : 'events'
        }
        
        this.subscriptions = [];
        
    },

	/**
	 * Service started lifecycle event handler
	 */
	async started() {
    
        // Start static subscriptions
        if (this.settings.subscriptions && Array.isArray(this.settings.subscriptions) ) {
            await Promise.all(this.settings.subscriptions.map(async subscription => {
                subscription.id =  uuidV4()

                // Static descriptions have access to events all emitted events
                subscription.meta = {
                    access: [ Constants.STATIC_GROUP ]
                }
                await this.subscribe(subscription)
            }));
        }
        
        this.producer = this.kafka.producer()
        await this.producer.connect()
        
    },

	/**
	 * Service stopped lifecycle event handler
	 */
	async stopped() {
        
        await Promise.all(this.subscriptions.map(async (subscription) => {
            try {
                await subscription.consumer.disconnect();
                this.logger.debug(`Consumer for subscription ${subscription.id} stopped`);

            } catch(err) {
                this.logger.warn(`Stopping consumer for subscription ${subscription.id} failed`);
            }
        }));
        this.logger.info(`All consumers disconnected`);
        
        await this.producer.disconnect();
        this.logger.info("Producer disconnectied");

    }
};