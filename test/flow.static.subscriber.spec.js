"use strict";
const mock = require("kafkajs").Kafka;
const { producers } = require("kafkajs");

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
                throw new Error("Test: Action called, which will always fail");
            }
        }
    }
};
let publisherAvailable = true;
let emittedEvent;
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
                emittedEvent = content;
                if (publisherAvailable) {
                    mock.__emit("events", 10, content);
                    return { success: "event stored", content: content };
                } else {
                    throw new Error("Publisher not available");
                }
            }
        }
    }
};

describe("Test subscription", () => {

    let subscriptions = [], broker, service, opts;
    beforeEach( () => {
        broker  = new ServiceBroker({
            logger: console,
            logLevel: "info" //"debug"
        });
        broker.createService(Action1);
        broker.createService(Action2);
        broker.createService(Action3);
        broker.createService(Action4);
        broker.createService(Action5);
        broker.createService(ActionFail);
        broker.createService(Publisher);
        flow = {
            "action.1": [],
            "action.2": [],
            "action.3": [],
            "action.4": [],
            "action.5": [],
            "action.fail": []
        };        
        emittedEvent = null;
        opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, groupId: `g-${timestamp}`, access: [`g-${timestamp}`] } };
        mock.__resetConsumers();
    });

    afterEach( async () => {
        try {
            await broker.stop();
        } catch (err) {
            console.log(err);
        }
    });

    describe("Test create service", () => {

        it("it should be created and started", async () => {
            service = broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
            await broker.start();  
            expect(service).toBeDefined();
        });
        
    });
    
    describe("Test consume & call action", () => {

        it("event match should call action ", async () => {
            subscriptions = [{
                id: "step.one"  + timestamp ,
                event: "test.emit",
                params: { id: "meta.user.id", timestamp: Date.now() },
                action: "action.1.call"
            }];    
            service = broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
            await broker.start();  
            let content = { 
                meta: opts.meta, 
                event: "test.emit",
                payload: { msg: "say hello to the world" },
            };
            await mock.__emit("events", 10, content);
            expect(flow["action.1"].length).toEqual(1);
        });
        
        it("event pattern .* match should call action ", async () => {
            subscriptions = [{
                id: "step.one"  + timestamp ,
                event: "test.*",
                params: { id: "meta.user.id", timestamp: Date.now() },
                action: "action.2.call"
            }];    
            service = broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
            await broker.start();  
            let content = { 
                meta: opts.meta, 
                event: "test.any",
                payload: { msg: "say hello to the world" },
            };
            await mock.__emit("events", 10, content);
            expect(flow["action.2"].length).toEqual(1);
        });
        
        it("event pattern .* shouldn't match event .one.two ", async () => {
            subscriptions = [{
                id: "step.one"  + timestamp ,
                event: "test.*",
                params: { id: "meta.user.id", timestamp: Date.now() },
                action: "action.1.call"
            }];    
            service = broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
            await broker.start();  
            let content = { 
                meta: opts.meta, 
                event: "test.one.two",
                payload: { msg: "say hello to the world" },
            };
            await mock.__emit("events", 10, content);
            expect(flow["action.1"].length).toEqual(0);
        });
        
        it("event pattern .** should match event .one.two ", async () => {
            subscriptions = [{
                id: "step.one"  + timestamp ,
                event: "test.**",
                params: { id: "meta.user.id", timestamp: Date.now() },
                action: "action.1.call"
            }];    
            service = broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
            await broker.start();  
            let content = { 
                meta: opts.meta, 
                event: "test.one.two",
                payload: { msg: "say hello to the world" },
            };
            await mock.__emit("events", 10, content);
            expect(flow["action.1"].length).toEqual(1);
        });

        it("eachMessage should throw error if action call failed ", async () => {
            subscriptions = [{
                id: "step.one"  + timestamp ,
                event: "test.emit",
                params: { id: "meta.user.id", timestamp: Date.now() },
                action: "action.fail.call"
            }];    
            service = broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
            await broker.start();  
            let content = { 
                meta: opts.meta, 
                event: "test.emit",
                payload: { msg: "say hello to the world" },
            };
            let result = await mock.__emit("events", 10, content);
            expect(flow["action.fail"].length).toEqual(1);
            expect(result.success).toEqual(0);
            expect(result.failed).toEqual(1);
        });
        
    });
    
    describe("Test consume & emit event", () => {

        it("event match should emit new event ", async () => {
            subscriptions = [{
                id: "step.one"  + timestamp ,
                event: "test.emit",
                emit: {
                    topic: "next",
                    event: "test.emit.received"
                }
            }];    
            service = broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
            await broker.start();  
            let content = { 
                meta: opts.meta, 
                event: "test.emit",
                payload: { msg: "say hello to the world" },
            };
            let result = await mock.__emit("events", 10, content);
            expect(result.success).toEqual(1);
            let raw = mock.__emittedEvent();
            emittedEvent = JSON.parse(raw.messages[0].value.toString());
            expect(raw.topic).toEqual("next");
            expect(emittedEvent.event).toEqual("test.emit.received");
        });

        it("eachMessage should not throw error if emit event failed ", async () => {
            subscriptions = [{
                id: "step.one"  + timestamp ,
                event: "test.emit",
                emit: {
                    topic: "next",
                    event: "test.emit.received"
                }
            }];    
            service = broker.createService(Subscriber, Object.assign({ settings: { brokers: ["192.168.2.124:9092"], subscriptions: subscriptions } }));
            await broker.start();  
            let content = { 
                meta: opts.meta, 
                event: "test.emit",
                payload: { msg: "say hello to the world" },
            };
            producers.forEach(producer => { producer.fail = true; });
            mock.__emittedEventReset();
            try {
                await mock.__emit("events", 10, content);
            } catch (err) {
                expect(err.message).toBe("simulated fail of producer.send");
            }
            let emittedEvent = mock.__emittedEvent();    
            expect(emittedEvent).toEqual(null); 
        });
        
    });
    
});

/*
describe("Test subscriber service with multiple subscriptions", () => {

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
        logLevel: "info" //"debug"
    });
    
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
    
});
*/
