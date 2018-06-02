"use strict";

const { ServiceBroker } = require("moleculer");
const { StaticSubscriber } = require("../index");
const { Publisher } = require("../index");

let broker  = new ServiceBroker({ logger: console, logLevel: "debug" });

broker.createService(Publisher, Object.assign({ settings: { brokers: ["192.168.2.124:9092"] } }));

broker.createService(StaticSubscriber, Object.assign({ 
    settings: { 
        brokers: ["192.168.2.124:9092"], 
        subscriptions: [
            {
                //id: "step.one" ,
                //fromBeginning: true,
                event: "my.first.event",
                action: "action.any"
            }
        ]
    } 
}));

broker.createService({
    name: "action",
    actions: {
        any: {
            async handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params }
                await this.logger.debug("Service called:", result)
                return;
            }
        }
    }
})    
    
let run = async () => {
    await broker.start();
    await broker.call("flow.publisher.emit", {
        event: "my.first.event",
        payload: { msg: "somthing useful" }
    })
    // wait some time for consuming...
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve()
      }, 500)
    })
    await broker.stop();
}
run();
