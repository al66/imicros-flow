"use strict";

const { ServiceBroker } = require("moleculer");
const { Next } = require("../index");

const timestamp = Date.now();

const Queue = {
    name: "queue",
    actions: {
        push: {
            handler(ctx) {
                this.logger.info("queue.push called");
                return this.list.push(ctx.params.object);
            }
        },
        pop: {
            handler() {
                this.logger.info("queue.pop called");
                return this.list.pop();
            }
        }
    },
    created () {
        this.list = [];
        let obj = {
            uid: "obj_" + timestamp
        };
        this.list.push(obj);
    }
};

describe("Test queue service", () => {

    let broker, service, queue;
    beforeAll(() => {
    });
    
    afterAll(() => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info" //"debug"
            });
            queue = await broker.createService(Queue);
            service = await broker.createService(Next, Object.assign({ 
                name: "next", 
                settings: {
                    actions: {
                        pop: "queue.pop"
                    },
                    queue: "next"
                },
                dependencies: ["queue"]
            }));
            await broker.start();
            expect(queue).toBeDefined();
            expect(service).toBeDefined();
        });

    });

    describe("Test runner", () => {
    
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
        
        it("it should process an element of the queue", () => {
            let params = {
                queue: "next",
                object: {
                    uid: "obj_" + timestamp
                }
            };
            return broker.call("queue.push", params, opts).then(res => {
                expect(res).toBeDefined();
            });
            
        });
        
        
    });
    
    /*
    describe("Test push, pop, length", () => {

        let opts;
        const q1 = timestamp + "_1", q2 = timestamp + "_2";
        
        
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
        
        it("it should return length 0 for a non-existing queue", () => {
            let params = {
                queue: q1
            };
            return broker.call("queue.length", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(0);
            });
            
        });
        
        it("it should push object to queue 1", () => {
            let params = {
                queue: q1,
                object: { 
                    prop1: "Property 1",
                    prop2: 2
                }
            };
            return broker.call("queue.push", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(1);
            });
            
        });
        
        it("it should return length 1 for queue 1", () => {
            let params = {
                queue: q1
            };
            return broker.call("queue.length", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(1);
            });
            
        });
        
        it("it should get object again from queue 1", () => {
            let params = {
                queue: q1
            };
            return broker.call("queue.pop", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.prop1).toBeDefined();
                expect(res.prop1).toEqual("Property 1");
                expect(res.prop2).toEqual(2);
            });
            
        });
        
        it("it should return resulting length 0 for queue 1", () => {
            let params = {
                queue: q1
            };
            return broker.call("queue.length", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(0);
            });
            
        });
        
        it("it should return an empty object", () => {
            let params = {
                queue: q1
            };
            return broker.call("queue.pop", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(null);
            });
            
        });
        
    });
    */
 
    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });    
    
});