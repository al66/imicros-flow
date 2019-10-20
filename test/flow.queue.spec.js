"use strict";

const { ServiceBroker } = require("moleculer");
const { Queue } = require("../index");

const timestamp = Date.now();

describe("Test queue service", () => {

    let broker, service;
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
            service = await broker.createService(Queue, Object.assign({ 
                name: "queue", 
                settings: { 
                    redis: {
                        port: process.env.REDIS_PORT || 6379,
                        host: process.env.REDIS_HOST || "127.0.0.1",
                        password: process.env.REDIS_AUTH || "",
                        db: process.env.REDIS_DB || 0,
                    }
                }
            }));
            await broker.start();
            expect(service).toBeDefined();
        });

    });
    
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
                    prop1: "Object 1 Queue 1",
                    prop2: 1
                }
            };
            return broker.call("queue.push", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(1);
            });
            
        });
        
        it("it should push object to queue 2", () => {
            let params = {
                queue: q2,
                object: { 
                    prop1: "Object 1 Queue 2",
                    prop2: 1
                }
            };
            return broker.call("queue.push", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(1);
            });
            
        });
        
        it("it should push second object to queue 1", () => {
            let params = {
                queue: q1,
                object: { 
                    prop1: "Object 2 Queue 1",
                    prop2: 2
                }
            };
            return broker.call("queue.push", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(2);
            });
            
        });
        
        it("it should return length 2 for queue 1", () => {
            let params = {
                queue: q1
            };
            return broker.call("queue.length", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(2);
            });
            
        });
        
        it("it should return length 1 for queue 2", () => {
            let params = {
                queue: q2
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
                expect(res.prop1).toEqual("Object 1 Queue 1");
                expect(res.prop2).toEqual(1);
            });
            
        });
        
        it("it should return resulting length 1 for queue 1", () => {
            let params = {
                queue: q1
            };
            return broker.call("queue.length", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(1);
            });
            
        });
        
        it("it should get object from queue 2", () => {
            let params = {
                queue: q2
            };
            return broker.call("queue.pop", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.prop1).toBeDefined();
                expect(res.prop1).toEqual("Object 1 Queue 2");
                expect(res.prop2).toEqual(1);
            });
            
        });
        
        it("it should return resulting length 0 for queue 2", () => {
            let params = {
                queue: q2
            };
            return broker.call("queue.length", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(0);
            });
            
        });
        
        it("it should return an empty object", () => {
            let params = {
                queue: q2
            };
            return broker.call("queue.pop", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(null);
            });
            
        });

        it("it should push multiple objects to queue 1", () => {
            let params = {
                queue: q1,
                object: [{ 
                    prop1: "Object 3 Queue 1",
                    prop2: 3
                },{ 
                    prop1: "Object 4 Queue 1",
                    prop2: 4
                }]
            };
            return broker.call("queue.push", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(3);
            });
            
        });
        
        it("it should get object 2 from queue 1", () => {
            let params = {
                queue: q1
            };
            return broker.call("queue.pop", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.prop1).toBeDefined();
                expect(res.prop1).toEqual("Object 2 Queue 1");
                expect(res.prop2).toEqual(2);
            });
            
        });
        
        it("it should get object 3 from queue 1", () => {
            let params = {
                queue: q1
            };
            return broker.call("queue.pop", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.prop1).toBeDefined();
                expect(res.prop1).toEqual("Object 3 Queue 1");
                expect(res.prop2).toEqual(3);
            });
            
        });

        it("it should return resulting length 1 for queue 1", () => {
            let params = {
                queue: q1
            };
            return broker.call("queue.length", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toBeDefined();
                expect(res.length).toEqual(1);
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