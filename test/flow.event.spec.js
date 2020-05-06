"use strict";

const { ServiceBroker } = require("moleculer");
const { Event } = require("../index");
const Constants = require("../lib/util/constants");

const timestamp = Date.now();

let list = [];
const Queue = {
    name: "flow.queue",
    actions: {
        push: {
            params: {
                queue: { type: "string" },
                object: [ { type: "object"}, { type: "array"} ]
            },
            handler(ctx) {
                this.logger.info("queue.push called", ctx.params);
                if (Array.isArray(ctx.params.object)) {
                    ctx.params.object.map((item) => {
                        list.push(item);
                    });
                } else {
                    list.push(ctx.params.object);
                }
                return list.length;
            }
        },
        pop: {
            handler() {
                this.logger.info("queue.pop called");
                return list.pop();
            }
        }
    }
};

let subscriptions = [];
const Query = {
    name: "flow.query",
    actions: {
        events: {
            handler(/*ctx*/) {
                this.logger.info("query.events called");
                return subscriptions;
            }
        }
    }
};

describe("Test event service", () => {

    let broker, service, queue, query;
    beforeAll(() => {
    });
    
    afterAll(() => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "debug" // "info" //"debug"
            });
            queue = await broker.createService(Queue);
            query = await broker.createService(Query);
            service = await broker.createService(Event, Object.assign({ 
                name: "flow.event", 
                settings: {
                    actions: {
                        query: {
                            events: "flow.query.events"
                        },
                        queue: {
                            push: "flow.queue.push"
                        }
                    },
                    queue: "events"
                },
                dependencies: ["flow.queue", "flow.query"]
            }));
            await broker.start();
            expect(queue).toBeDefined();
            expect(query).toBeDefined();
            expect(service).toBeDefined();
        });

    });

    describe("Test event handler", () => {
    
        let opts;
        
        beforeEach(() => {
            opts = { 
                meta: { 
                    acl: {
                        accessToken: "this is the access token",
                        owner: {
                            id: `g1-${timestamp}`
                        }
                    }, 
                    user: { 
                        id: `1-${timestamp}` , 
                        email: `1-${timestamp}@host.com` }, 
                    access: [`1-${timestamp}`, `2-${timestamp}`] 
                } 
            };
        });
        
        it("it should push one subscription to the queue", () => {
            let params = {
                event: "first event",
                payload: {
                    param1: 1,
                    param2: "first"
                }
            };
            subscriptions = [{
                uid: "e-id",
                name: "first event",
                position: Constants.START_EVENT,
                type: Constants.DEFAULT_EVENT,
                direction: Constants.CATCHING_EVENT,
                interaction: "",
                process: {
                    id: "p-id",
                },
                owner: {
                    type: "group",
                    id: "o-id"
                }
            }];
            return broker.call("flow.event.handle", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(list.length).toEqual(1);
                console.log(list);
                expect(list[0]).toEqual(expect.objectContaining({
                    subscription: subscriptions[0]
                }));
                
            });
            
        });
        
        
    });
    

 
    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });    
    
});