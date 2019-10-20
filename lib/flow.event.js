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
                subscriptions: "flow.query.subscriptions"
            },
            context: {
                create: "flow.context.create"
            }
        },
        queue: "next"
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
                let subscriptions = await this.broker.call(this.actions.query.subscriptions, params, options);
                this.logger.debug(`Subscritions for received event ${ctx.params.id}`, {
                    event: ctx.params.event.name,
                    subscriptions: subscriptions
                });
                
                // Loop at subscriptions and build next entries
                let next = [];
                if (Array.isArray(subscriptions)) {
                    subscriptions.map((item) => {
                        let elem = {
                            id: item.id,
                            type: "event",
                            process: _.get(item,"process.id",null),
                            step: _.get(item,"step.id",null),
                            payload: ctx.params.payload,
                            meta: ctx.meta
                        };
                        next.push(elem);
                    });
                }
                
                // push next entries to queue
                if (next.length > 0) {
                    await this.broker.call(this.actions.subscriptions, params, options);
                }
                
                // return number of found subscriptions
                this.logger.debug(`${next.length} events pushed to queue "next"`, {
                    event: params.event
                });
                
                
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
    
        this.queue = _.get(this.settings,"queue","next");
        this.actions = {
            query: {
                subscriptions: _.get(this.settings,"actions.query.subscriptions","flow.query.subscriptions")
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