"use strict";
const { ServiceBroker } = require("moleculer");
const Publisher = require("../lib/flow.publisher");
const Subscriber = require("../lib/flow.static.subscriber");

const timestamp = Date.now();
const calls = {
    "action.1": [],
    "action.2": [],
    "action.3": [],
};
const Action1 = {
    name: "action.1",
    actions: {
        call: {
            async handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                //this.logger.info("Service called:", result)
                await calls["action.1"].push(result);
                return result;
            }
        }
    }
};
const Action2 = {
    name: "action.2",
    actions: {
        call: {
            async handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                //this.logger.info("Service called:", result)
                calls["action.2"].push(result);
                return result;
            }
        }
    }
};
const Action3 = {
    name: "action.3",
    actions: {
        call: {
            async handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                //this.logger.info("Service called:", result)
                calls["action.3"].push(result);
                return result;
            }
        }
    }
};

const subscriptions = [
    {
        id: "step.one" + timestamp ,
        event: "test.emit",
        fromBeginning: false,
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.1.call"
    },    
    {
        id: "step.two" + timestamp,
        event: "test.*",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.2.call",
        emit: "action.2.terminated",
        payload: { origin: "result.service" }
    },    
    {
        // w/o id: will be processed by each started service
        //id: "step.three"  + timestamp,
        event: "action.2.terminated",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.3.call"
    }    
];
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
            event: "test.emit",
            payload: { msg: "Number" + i }
        };
        await broker.call("flow.publisher.emit", params, opts);
        count++;
    }
    for (let i = 0; i<n; i++) {
        params = {
            event: "test.other",
            payload: { msg: "Number" + i }
        };
        await broker.call("flow.publisher.emit", params, opts);
        count++;
    }
};
let direct = async () => {
    let opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, groupId: `g-${timestamp}`, access: [`g-${timestamp}`] } };
    let params;
    for (let i = 0; i<1000; i++) {
        params = {
            event: "test.other",
            payload: { msg: "Number" + i }
        };
        await broker.call("action.1.call", params, opts);
    }
};
let ts, te;
let run = async () => {
    // Cycle 1: direct calls
    await broker.createService(Action1);
    await broker.start();
    ts = Date.now();
    await direct();
    te = Date.now();
    console.log({
        "direct action.1": calls["action.1"].length,
        "time (ms)": te-ts
    });
    await broker.stop();
    calls["action.1"] = [];

    // Cycle 1: publisher only
    await broker.createService(Publisher, Object.assign({ settings: { brokers: ["192.168.2.124:9092"] } }));
    await broker.start();
    ts = Date.now();
    await emit();
    te = Date.now();
    console.log({
        "emit": count,
        "time (ms)": te-ts
    });
    await broker.stop();
    count = 0;
    
    await broker.createService(Action1);
    await broker.createService(Action2);
    await broker.createService(Action3);
    await broker.createService(Publisher, Object.assign({ settings: { brokers: ["192.168.2.124:9092"] } }));
    await broker.createService(Publisher, Object.assign({ settings: { brokers: ["192.168.2.124:9092"] } }));
    await broker.createService(Publisher, Object.assign({ settings: { brokers: ["192.168.2.124:9092"] } }));
    await broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
    await broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
    await broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
    await broker.start();
    ts = Date.now();
    await emit();
    te = Date.now();
    console.log({
        "emit": count,
        "action.1": calls["action.1"].length,
        "action.2": calls["action.2"].length,
        "action.3": calls["action.3"].length,
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
            "action.1": calls["action.1"].length,
            "action.2": calls["action.2"].length,
            "action.3": calls["action.3"].length,
        }
    });
    await broker.stop();
    // check for open handles
    //console.log(process._getActiveRequests());
    //console.log(process._getActiveHandles());
    
};
run();

