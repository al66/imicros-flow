/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

module.exports = {
    // Static [kafka]
    Publisher: require("./lib/flow.publisher"),
    StaticSubscriber: require("./lib/flow.static.subscriber"),
    // Dynamic [Neo4j]
    Controller: require("./lib/flow.control"),
    Query: require("./lib/flow.query"),
    Serializer: require("./lib/util/serializer"),
    Queue: require("./lib/flow.queue"),
    Next: require("./lib/flow.next")
};
