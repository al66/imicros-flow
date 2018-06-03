"use strict";
const mock = require("kafkajs").Kafka;

const { ServiceBroker } = require("moleculer");
const Subscriber = require("../lib/flow.static.subscriber");

const timestamp = Date.now();
let flow = [];
const Action1 = {
    name: "action.1",
    actions: {
        call: {
            handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                this.logger.info(this.name + " called", result);
                flow.push(result);
                return result;
            }
        }
    }
};
const Action2 = {
    name: "action.2",
    actions: {
        call: {
            handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                this.logger.info(this.name + " called", result);
                flow.push(result);
                return result;
            }
        }
    }
};
const Action3 = {
    name: "action.3",
    actions: {
        call: {
            handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                this.logger.info(this.name + " called", result);
                flow.push(result);
                return result;
            }
        }
    }
};
const Publisher = {
    name: "flow.publisher",
    actions: {
        emit: {
            handler(ctx) {
                let content = { 
                    meta: ctx.meta, 
                    event: ctx.params.event,
                    payload: ctx.params.payload,
                };
                mock.__emit("events", 10, content);
                return { success: "event stored", content: content };
            }
        }
    }
};
const subscriptions = [
    {
        id: "step.one"  + timestamp ,
        event: "test.emit",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.1.call"
    },    
    {
        id: "step.two" + timestamp ,
        event: "test.*",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.2.call",
        emit: "action.2.terminated"
    },    
    {
        event: "action.2.terminated",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.3.call"
    }    
];
let broker  = new ServiceBroker({
    logger: console,
    logLevel: "info" //"debug"
});

describe("Test subscriber service", () => {

    let service;
    beforeAll(() => {
    });

    afterAll( async () => {
        try {
            
            await broker.stop();

            await new Promise((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 100);
            });
            
        } catch (err) {
            console.log(err);
        }
    });
    

    describe("Test create service", () => {

        let createServices = () => {
            broker.createService(Action1);
            broker.createService(Action2);
            broker.createService(Action3);
            broker.createService(Publisher);
            service = broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
        };
        it("it should be created and started", async () => {
            await createServices();
            await broker.start();  
            expect(service).toBeDefined();
        });
        
    });

    describe("Test subscriptions w/o owner", () => {

        let opts;
        beforeEach(() => {
            flow = [];
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, groupId: `g-${timestamp}`, access: [`g-${timestamp}`] } };
        });

        it("'test.emit' should be received by both subscriptions ", async () => {
            let content = { 
                meta: opts.meta, 
                event: "test.emit",
                payload: { msg: "say hello to the world" },
            };
            await mock.__emit("events", 10, content);
            expect(flow.length).toEqual(3);
        });
        
        it("it should emit an event for the subscription ", async () => {
            let content = { 
                meta: opts.meta, 
                event: "test.other",
                payload: { msg: "say hello to the world" },
            };
            await mock.__emit("events", 10, content);
            expect(flow.length).toEqual(2);
        });

    });
    
    /*
    describe("Test subscriptions with owner", () => {

        beforeEach(() => {
            flow = [];
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, groupId: `g-${timestamp}`, access: [`g-${timestamp}`] } }
        })

        it("it should emit an event for the subscription ", () => {
            let params = {
                event: "test.emit",
                payload: { msg: "say hello to the world" }
			};
            return broker.call("flow.publisher.emit", params, opts).then(res => {
                expect(res.success).toBeDefined();
                expect(res.content).toEqual(expect.objectContaining(params))
                expect(res.content.meta).toBeDefined();
            });
        });
        
        it("it should emit an event for the subscription ", () => {
            let params = {
                event: "test.other",
                payload: { msg: "say hello to the world" }
			};
            return broker.call("flow.publisher.emit", params, opts).then(async (res) => {
                expect(res.success).toBeDefined();
                expect(res.content).toEqual(expect.objectContaining(params))
                expect(res.content.meta).toBeDefined();
            });
        });

    });
    */
    
});