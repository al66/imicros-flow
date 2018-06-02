"use strict";

const { ServiceBroker } = require("moleculer");
const { Publisher } = require("../index");

let broker  = new ServiceBroker({ logger: console, logLevel: "debug" });

broker.createService(Publisher, Object.assign({ settings: { brokers: ["192.168.2.124:9092"] } }));

let run = async () => {
    await broker.start();
    await broker.call("flow.publisher.emit", {
        event: "my.first.event",
        payload: { msg: "somthing useful" }
    })
    await broker.stop();
}
run();
