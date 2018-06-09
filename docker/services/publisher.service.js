"use strict";

const { Publisher } = require("imicros-flow");

module.exports = {
    name: "flow.publisher",
    mixins: [Publisher],

    /**
     * Service settings
     */
    settings: {
        brokers: ["kafka_kafka_1:9092"]
    },

    /**
     * Service metadata
     */
    metadata: {},

};