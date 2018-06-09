"use strict";

const { StaticSubscriber } = require("imicros-flow");

module.exports = {
    name: "flow.subscriber.1",
    mixins: [StaticSubscriber],

    /**
     * Service settings
     */
    settings: {
        brokers: ["kafka_kafka_1:9092"],
        subscriptions: [
            {
                id: "registration" ,                        // consumer group
                //fromBeginning: 'earliest',                // if already events exists and consumer group should handle
                                                            // them starting with the first existing
                event: "user.created",                      // event listening for
                action: "registration.requestConfirmation"  // action to be called
            }
        ]
    },

    /**
     * Service metadata
     */
    metadata: {},

    /**
     * Service dependencies
     */
    dependencies: ["flow.publisher"],	

};