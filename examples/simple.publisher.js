"use strict";

const { ServiceBroker } = require("moleculer");
const { Publisher } = require("../index");

let broker  = new ServiceBroker({ logger: console, logLevel: "debug" });

const Service = {
    name: "flow.publisher",
    mixins: [Publisher],
    settings: {
        brokers: ["192.168.2.124:9092"]
    }
};

broker.createService(Service);

let run = async () => {
    await broker.start();
    await broker.call("flow.publisher.emit", {
        event: "my.first.event",
        payload: { msg: "somthing useful" }
    }).then(res => console.log(res));
    await broker.stop();
};
run();
