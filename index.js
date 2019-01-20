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
    Listener: require("./lib/flow.listener"),
    Emitter: require("./lib/flow.emitter"),
    Middleware: require("./lib/flow.middleware"),
    Serializer: require("./lib/util/serializer")
};
