/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const _ = require("lodash");

/** Actions */
// action handle { event } => { number of subscriptions }

module.exports = {
    name: "flow.event",
    
    /**
     * Service settings
     */
    settings: {
        /*
        actions: {
            query: {
                events: "flow.query.events"
            }
        },
        queue: "events"
        */        
    },

    /**
     * Service metadata
     */
    metadata: {},

    /**
     * Service dependencies
     */
    //dependencies: ["flow.queue"],	

    /**
     * Actions
     */
    actions: {

        /**
         * handle event
         * 
         * @actions
         * @param {Object} event
         * @param {Object} payload
         * 
         * @returns {Integer} number of subscriptions
         */
        handle: {
            params: {
                event: { type: "string" },
                payload: { type: "object" }
            },
            async handler(ctx) {                
                let params = {
                    event: {
                        name: ctx.params.event,
                        version: _.get(ctx.meta,"event.version",null),
                        id: _.get(ctx.meta,"event.id",null),
                        process: _.get(ctx.meta,"flow.process",null),
                        step: _.get(ctx.meta,"flow.step",null),
                        instance: _.get(ctx.meta,"flow.instance",null)
                    }
                };
                let options = {
                    meta: ctx.meta
                };
                let subscriptions = await this.broker.call(this.actions.query.events, params, options);
                this.logger.debug(`Subscritions for received event ${ctx.params.id}`, {
                    event: ctx.params.event.name,
                    subscriptions: subscriptions
                });
                
                // Loop at subscriptions and build next entries
                let events = [];
                if (Array.isArray(subscriptions)) {
                    subscriptions.map((item) => {
                        let elem = {
                            event: params.event,
                            payload: ctx.params.payload,
                            subscription: item
                        };
                        events.push(elem);
                    });
                }
                
                // push event entries to queue
                if (events.length > 0) {
                    let params = {
                        queue: this.queue,
                        object: events
                    };
                    await this.broker.call(this.actions.queue.push, params, options);
                }
                
                // return number of found subscriptions
                this.logger.debug(`${events.length} events pushed to queue "events"`, {
                    event: params.event
                });
                
                return events.length;
                
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
    methods: {},

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        this.queue = _.get(this.settings,"queue","events");
        this.actions = {
            query: {
                events: _.get(this.settings,"actions.query.events","flow.query.events")
            },
            queue: {
                push: _.get(this.settings,"actions.queue.push","flow.queue.push")
            }
        };
        
    },

    /**
     * Service started lifecycle event handler
     */
    async started() {},

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {}
    
};