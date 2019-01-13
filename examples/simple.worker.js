"use strict";

const { ServiceBroker } = require("moleculer");
const { Listener } = require("../index");
const { Middleware } = require("../index");


let broker  = new ServiceBroker({ 
    logger: console, 
    logLevel: "info",
    middlewares: [Middleware],
    emitter: { 
        brokers: process.env.KAFKA_BROKER ? [process.env.KAFKA_BROKER] : ["192.168.2.124:9092"]
    }
});

const listen = {
    name: "flow.listener",
    mixins: [Listener],
    settings: {
        brokers: ["192.168.2.124:9092"],
        topics: {
            events: "flow.events",
            tasks: "flow.tasks"
        }
    }
};

const dummy = {
    name: "dummy",
    actions: {
        execute: {
            handler(ctx) {
                console.log("received call to dummy.execute", ctx.params, ctx.meta);
            }
        },
        emit: {
            handler(ctx) {
                ctx.broker.emit(ctx.params.event, ctx.params.payload, null, ctx.params.meta);
            }
        }
    }
};


const next = {
    name: "flow.query",

    actions: {
     
        next: {
            params: {
                event: { 
                    type: "object", 
                    props: {
                        name: { type: "string", empty: false },
                        owner: { 
                            type: "object",
                            props: {
                                type: { type: "string"},
                                id: { type: "string" }
                            }    
                        },
                        process: { type: "string", optional: true },
                        step: { type: "string", optional: true }
                    }
                }                
            },
            handler(ctx) {
                if (ctx.params.event.name !== "dummy.newFileReceived") return [];
                let result = [{
                    task: {
                        process: "my process",
                        step: "first step",
                        service: "dummy",
                        action: "execute",
                        map: ".",
                        owner: { 
                            type: "group",
                            id: "group 1" 
                        }
                    },
                    onDone: {
                        event: "dummy.execute.done"
                    },
                    onError: {
                        event: "to be emitted on error"
                    }
                }];
                return result;
            }
        }
        
    }
};

broker.createService(listen);
broker.createService(next);
broker.createService(dummy);

let run = async () => {
    await broker.start();
    await broker.call("dummy.emit", {
        event: "dummy.newFileReceived",
        payload: {
            account: "billing",
            path: "/incoming",
            fileName: "invoice-565654-20190104.txt"
        },
        meta: {
            owner: {
                type: "group",
                id: "group_1"
            }
        }
    })
    //.then(res => console.log(res))
    .catch(err => console.log(err));
    // give some time to consume
    await new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, 1000);
    });
    await broker.stop();
};
run();