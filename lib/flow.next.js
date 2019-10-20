/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const _ = require("lodash");

/** Actions */
// runner - no actions

module.exports = {
    name: "next",
    
    /**
     * Service settings
     */
    settings: {
        /*
        actions: {
            pop: "flow.queue.pop"
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
    actions: {},

    /**
     * Events
     */
    events: {},

    /**
     * Methods
     */
    methods: {

        async consume () {
            let params = {
                queue: this.queue
            };
            let meta = {};
            let element = await this.broker.call(this.actions.pop, params, { meta: meta });
            this.logger.debug(`Element of queue ${this.queue} received`, {
                element: element
            });
                        
        },
        
        run () {
            let loop = () => {
                this.running = true;
                this.consume().then(() => { 
                    if (this.pause) {
                        this.running = false;
                        return;
                    }
                    if (this.running) setImmediate(loop); 
                });
            };
            loop();
        },
        
        async stop () {
            this.pause = true;
            return new Promise((resolve) => {
                let check = () => {
                    if (this.running) {
                        setTimeout(check,10); 
                        return;
                    } else {
                        return resolve();   
                    }
                };
                check();
            });
        }
        
    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        this.queue = _.get(this.settings,"queue","next");
        this.actions = {
            pop: _.get(this.settings,"actions.pop","queue.pop")
        };
        
    },
    /**
     * Service started lifecycle event handler
     */
    async started() {

        // start running
        this.run();
        
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {
        
        // stop running
        await this.stop();
        
    }
    
};