/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { StreamsWorker } = require("imicros-streams");
//const _ = require("lodash");
const _ = require("./util/lodash");

/** Actions */
// runner - no actions

module.exports = {
    name: "next",
    mixins: [StreamsWorker],
    
    /**
     * Service settings
     */
    settings: {
        /*
        streams: {
            stream: "token",
            group: "token",
            service: "streams"
        },
        services: {
            token: "token",
            streams: "streams
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

        async handle({message,stream,id}) {
            let params = {
                processId: message.processId,
                instanceId: message.instanceId,
                elementId: message.elementId,
                type: message.type,
                status: message.status,
                user: message.user,
                ownerId: message.ownerId
            };
            let opts = {};
            this.logger.debug("new token received", { token: params, stream: stream, id: id, handler: this.services.token + ".handle" });
            try {
                await this.broker.call(this.services.token + ".handle", params, opts);
            } catch (err) {
                this.logger.error("Call to service " + this.services.token + ".handle failed", { params: params, err: err });
            }
            return true;
        }

    },

    /**
     * Service created lifecycle event handler
     */
    async created() {
        
        if (!this.services) this.services = {};
        this.services.token = _.get(this.settings,"services.token","token");
        this.services.streams = _.get(this.settings,"services.streams","streams");
        
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