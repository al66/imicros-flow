"use strict";

const { ServiceBroker } = require("moleculer");
const { Handler } = require("../index");
const Constants = require("../lib/util/constants");
const { v4: uuid } = require("uuid");

const timestamp = Date.now();

let tokens = [];
let tokenstore = [];
let owner = {
    type: "user",
    id: uuid()
};
let process = {
    defaultEvent: {
        processId: uuid(), 
        id: uuid(),
        name: "Start",
        position: Constants.START_EVENT,
        type: Constants.DEFAULT_EVENT,
        direction: Constants.CATCHING_EVENT,
        interaction: "",
        ownerType: owner.type,
        ownerId: owner.id        
    },
    current: {},
    next: [],
    nextEventGateway: []
};

const Mock = {
    name: "mock",
    actions: {
        emitToken: {
            handler(ctx) {
                tokens.push(ctx.params.token);
                this.logger.info("mock.emitToken called", { params: ctx.params });
                return true;
            }
        },
        saveToken: {
            handler(ctx) {
                tokenstore.push(ctx.params.token);
                this.logger.info("mock.saveToken called", { params: ctx.params });
                return true;
            }
        },
        deleteToken: {
            handler(ctx) {
                let index = tokenstore.indexOf(ctx.params.token);
                if (index > -1) tokenstore.splice(index,1);
                this.logger.info("mock.deleteToken called", { params: ctx.params });
                return true;
            }
        },
        getMeta: {
            handler(/*ctx*/) {
                return {
                    acl: {
                        accessToken: "this is the access token",
                        owner: {
                            id: `g1-${timestamp}`
                        }
                    }, 
                    user: { 
                        id: `1-${timestamp}` , 
                        email: `1-${timestamp}@host.com` 
                    } 
                };
            }
        },
        default: {
            handler(/*ctx*/) {
                return [ process.defaultEvent ];
            }
        },
        next: {
            handler(ctx) {
                switch ( ctx.params.current ) {
                    case null:
                        return [ process.defaultEvent ];
                    default:
                        return process.next;
                }
            }
        },
        nextEventGateway: {
            handler(/*ctx*/) {
                return process.nextEventGateway;
            }
        },
        current: {
            handler(/*ctx*/) {
                return process.current;
            }
        }
    }    
};

describe("Test handler service", () => {

    let broker, service, mock;
    beforeAll(() => {
    });
    
    afterAll(() => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "debug" //"info" //"debug"
            });
            mock = await broker.createService(Mock);
            service = await broker.createService(Handler, Object.assign({ 
                name: "handler", 
                settings: {
                    actions: {
                        emitToken: "mock.emitToken",
                        saveToken: "mock.saveToken",
                        deleteToken: "mock.deleteToken",
                        next: "mock.next",
                        current: "mock.current",
                        default: "mock.default",
                        getMeta: "mock.getMeta"
                    }
                },
                dependencies: ["mock"]
            }));
            await broker.start();
            expect(mock).toBeDefined();
            expect(service).toBeDefined();
        });

    });

    describe("Test activity", () => {
    
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
        
        it("it should emit activity ready token", () => {
            let params = {
                token: {
                    process: uuid(),
                    instance: uuid(),
                    step: uuid(),
                    status: Constants.ACTIVITY_ACTIVATED
                }
            };
            tokens = [];
            tokenstore = [];
            return broker.call("handler.token", params, opts).then(res => {
                let token = params.token;
                token.status = Constants.ACTIVITY_READY;
                expect(res).toEqual(true);
                expect(tokens[0]).toEqual(token);
                expect(tokenstore[0]).toEqual(token);
            });
            
        });
 
        it("it should emit start event activated token", () => {
            let params = {
                token: {
                    process: uuid(),
                    instance: uuid(),
                    status: Constants.PROCESS_ACTIVATED
                }
            };
            tokens = [];
            return broker.call("handler.token", params, opts).then(res => {
                let token = params.token;
                token.step = process.defaultEvent.id;
                token.status = Constants.EVENT_ACTIVATED;
                expect(res).toEqual(true);
                expect(tokens[0]).toEqual(token);
            });
            
        });
 
    });

    describe("Test sequence", () => {

        it("it should emit completed token", () => {
            let params = {
                token: {
                    process: uuid(),
                    instance: uuid(),
                    step: uuid(),
                    status: Constants.SEQUENCE_ACTIVATED
                }
            };
            process.current = {
                processId: params.token.process,
                uid: params.token.step,
                ownerType: owner.type,
                ownerId: owner.id,        
                type: Constants.SEQUENCE_STANDARD
            };
            tokens = [];
            return broker.call("handler.token", params).then(res => {
                let token = params.token;
                //token.step = process.next[0].uid;
                token.step = params.step;
                token.status = Constants.SEQUENCE_COMPLETED;
                expect(res).toEqual(true);
                expect(tokens[0]).toEqual(token);
            });
            
        });
        
        it("it should emit activity activated token", () => {
            let params = {
                token: {
                    process: uuid(),
                    instance: uuid(),
                    step: uuid(),
                    status: Constants.SEQUENCE_COMPLETED
                }
            };
            process.next = [{
                processId: params.token.process,
                uid: uuid(),
                name: "Next Task",
                ownerType: owner.type,
                ownerId: owner.id,        
                type: Constants.MANUAL_TASK
                //attributes: task.attributes ? JSON.stringify(task.attributes) : "."
            }];
            tokens = [];
            return broker.call("handler.token", params).then(res => {
                let token = params.token;
                token.step = process.next[0].uid;
                token.status = Constants.ACTIVITY_ACTIVATED;
                expect(res).toEqual(true);
                expect(tokens[0]).toEqual(token);
            });
            
        });
    });

    describe("Test event-based gateway", () => {

        
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