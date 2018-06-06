"use strict";
const { ServiceBroker } = require("moleculer");
const Publisher = require("../lib/flow.publisher");
const Subscriber = require("../lib/flow.static.subscriber");

const timestamp = Date.now();
const calls = [];
const Action = {
    name: "action",
    actions: {
        call: {
            async handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                //this.logger.info("Service called:", result)
                await calls.push(result);
                return result;
            }
        }
    }
};

const collection = [];
for (let i=0; i< 10; i++) {
    let subscription = [];
    // 10 x 10 = 100k messages are consumed - ok -> runs about 1 minute w/o errors
    // 10 x 100 = 1m messages are consumed - works more or less, but not applicable on one instance  -> runs about 13 minutes w/o errors 
    // 10 x 1000 throws connection errors due to timeouts  
    for (let n=0; n< 100; n++) {    
        let item = {
            id: "step-" + i + "-" + n,
            event: "any",
            params: { id: "meta.user.id", timestamp: Date.now() },
            action: "action.call"
        };
        subscription.push(item);
    }
    collection.push(subscription);
}
let broker  = new ServiceBroker({
    logger: console,
    logLevel: "info" //"debug"
});
let n = 1000;
let count = 0;
let emit = async () => {
    let opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, groupId: `g-${timestamp}`, access: [`g-${timestamp}`] } };
    let params;
    for (let i = 0; i<n; i++) {
        params = {
            event: "any",
            payload: { msg: "Number" + i }
        };
        await broker.call("flow.publisher.emit", params, opts);
        count++;
    }
};
let ts, te;
let run = async () => {
    await broker.createService(Action);
    await broker.createService(Publisher, Object.assign({ settings: { brokers: ["192.168.2.124:9092"] } }));
    // multiple subscirber
    await collection.map(async (subscription) => {
        await broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscription } }));
    });
    await broker.start();
    ts = Date.now();
    await emit();
    te = Date.now();
    console.log({
        "emit": count,
        "action": calls.length,
        "time (ms)": te-ts
    });
    await new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, 10000);
    });
    console.log({
        "final": {
            "emit": count,
            "action": calls.length,
        }
    });
    await broker.stop();
    // check for open handles
    //console.log(process._getActiveRequests());
    //console.log(process._getActiveHandles());
    
};
run();