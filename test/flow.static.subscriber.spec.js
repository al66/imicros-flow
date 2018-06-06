"use strict";
const mock = require("kafkajs").Kafka;

const { ServiceBroker } = require("moleculer");
const Subscriber = require("../lib/flow.static.subscriber");

const timestamp = Date.now();
let flow = {
    "action.1": [],
    "action.2": [],
    "action.3": [],
    "action.4": [],
    "action.5": [],
    "action.fail": []
};
const Action1 = {
    name: "action.1",
    actions: {
        call: {
            handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                this.logger.info(this.name + " called", result);
                flow["action.1"].push(result);
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
                flow["action.2"].push(result);
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
                flow["action.3"].push(result);
                return result;
            }
        }
    }
};
const Action4 = {
    name: "action.4",
    actions: {
        call: {
            handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                this.logger.info(this.name + " called", result);
                flow["action.4"].push(result);
                return result;
            }
        }
    }
};
const Action5 = {
    name: "action.5",
    actions: {
        call: {
            handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                this.logger.info(this.name + " called", result);
                flow["action.5"].push(result);
                return result;
            }
        }
    }
};
const ActionFail = {
    name: "action.fail",
    actions: {
        call: {
            handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params };
                flow["action.fail"].push(result);
                throw new Error("called action fail");
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
    },    
    {
        id: "unauthorized" + timestamp ,
        access: [`g-other-${timestamp}`],
        event: "test.*",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.4.call"
    },    
    {
        id: "authorized" + timestamp ,
        access: [`g-${timestamp}`],
        event: "test.*",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.5.call"
    },    
    {
        id: "fail" + timestamp ,
        access: [`g-${timestamp}`],
        event: "fail",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.fail.call"
    },        
    {
        id: "don't fail"  + timestamp ,
        event: "fail",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.1.call"
    }
];
let broker  = new ServiceBroker({
    logger: console,
    logLevel: "debug" //"debug"
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
            broker.createService(Action4);
            broker.createService(Action5);
            broker.createService(ActionFail);
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
            flow = {
                "action.1": [],
                "action.2": [],
                "action.3": [],
                "action.4": [],
                "action.5": [],
                "action.fail": []
            };
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, groupId: `g-${timestamp}`, access: [`g-${timestamp}`] } };
        });

        it("'test.emit' should be received by both subscriptions ", async () => {
            let content = { 
                meta: opts.meta, 
                event: "test.emit",
                payload: { msg: "say hello to the world" },
            };
            await mock.__emit("events", 10, content);
            expect(flow["action.1"].length).toEqual(1);
            expect(flow["action.2"].length).toEqual(1);
            expect(flow["action.3"].length).toEqual(1);
            expect(flow["action.4"].length).toEqual(1);
            expect(flow["action.5"].length).toEqual(1);
        });
        
    });
    
    describe("Test subscriptions failed action", () => {

        let opts;
        beforeEach(() => {
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, groupId: `g-${timestamp}`, access: [`g-${timestamp}`] } };
        });

        it("it should consume the event with the failed action again ", async () => {
            let content = { 
                meta: opts.meta,
                owner: `g-${timestamp}`,
                event: "fail",
                payload: { msg: "say hello to the world" },
            };
            let result = await mock.__emit("events", 10, content);
            expect(result.success).toEqual(6);
            expect(result.failed).toEqual(1);
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