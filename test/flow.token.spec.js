"use strict";

const { ServiceBroker } = require("moleculer");
const { Token } = require("../index");
const { Constants } = require("imicros-flow-control");
const { AclMiddleware } = require("imicros-acl");
const { v4: uuid } = require("uuid");

const timestamp = Date.now();

let ownerId = uuid();
let meta = {
    ownerId: ownerId,
    acl: {
        accessToken: "this is the access token",
        ownerId: ownerId
    }, 
    user: { 
        id: `1-${timestamp}` , 
        email: `1-${timestamp}@host.com` }
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
        ownerId: ownerId        
    },
    current: {},
    next: [],
    nextEventGateway: []
};

// mock service streams
let stream = [];
const Streams = {
    name: "streams",
    actions: {
        add: {
            params: {
                stream: { type: "string" },
                message: { type: "object" }
            },			
            async handler(ctx) {
                this.logger.info("streams.add called", { stream: ctx.params.stream, message: ctx.params.message } );
                stream.push(ctx.params.message);
                return { id: uuid() };
            }
        }
    }
};

// mock service flow.context
let token = [];
let context = {};
const Context = {
    name: "flow.context",
    actions: {
        add: {
            params: {
                instanceId: { type: "uuid" },
                key: { type: "string" },
                value: { type: "any" }
            },
            handler(ctx) {
                this.logger.info("context.add called", { params: ctx.params });
                if (!context[ctx.params.instanceId]) context[ctx.params.instanceId] = [];
                context[ctx.params.instanceId][ctx.params.key] = ctx.params.value;
                return true;
            }
        },
        get: {
            params: {
                instanceId: { type: "uuid" },
                key: { type: "string" }
            },
            handler(ctx) {
                this.logger.info("context.get called", { params: ctx.params });
                return context[ctx.params.instanceId] ? context[ctx.params.instanceId][ctx.params.key] : null;
            }
        },
        getKeys: {
            params: {
                instanceId: { type: "uuid" },
                keys: { type: "array", item: "string" }
            },
            handler(ctx) {
                this.logger.info("context.getKeys called", { params: ctx.params });
                return context;
            }
        },
        updateToken: {
            params: {
                instanceId: { type: "uuid" },
                consume: { 
                    type: "array",
                    item: "object", // token
                    optional: true
                },
                emit: { 
                    type: "array",
                    item: "object", // token
                    optional: true
                }
            },
            async handler(ctx) {
                this.logger.info("token.update called", { instanceId: ctx.params.instanceId, consume: ctx.params.consume, emit: ctx.params.emit } );
                if (ctx.params.consume) await ctx.params.consume.map(c => { token = token.filter(t => t !==  c); });
                if (ctx.params.emit) await ctx.params.emit.map(t => token.push(t));
                return true;
            }
        }
    }
};

// mock service query
const Query = {
    name: "flow.query",
    actions: {
        getTask: {
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.Task called", { params: ctx.params, meta: ctx.meta } );
                if (ctx.meta.ownerId !== ownerId) return false;
                return [process.current];
            }
        },
        getSequence: {
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.getSequence called", { params: ctx.params, meta: ctx.meta } );
                if (ctx.meta.ownerId !== ownerId) return false;
                return [process.current];
            }
        },
        getEvent: {
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.getEvent called", { params: ctx.params, meta: ctx.meta } );
                if (ctx.meta.ownerId !== ownerId) return false;
                return [process.current];
            }
        },
        getGateway: {
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.getGateway called", { params: ctx.params, meta: ctx.meta } );
                if (ctx.meta.ownerId !== ownerId) return false;
                return [process.current];
            }
        },
        next: {
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.next called", { params: ctx.params, meta: ctx.meta } );
                if (ctx.meta.ownerId !== ownerId) return false;
                return process.next;
            }
        }
    }
};

// mock service acl
let accessToken = "access for group allowed";
const ACL = {
    name: "acl",
    actions: {
        requestAccess: {
            params: {
                forGroupId: { type: "string" }
            },			
            async handler(ctx) {
                this.logger.info("acl.requestAccess called", { params: ctx.params, meta: ctx.meta } );
                if (ctx.meta.user === meta.user && ctx.meta.ownerId === meta.ownerId && ctx.meta.serviceToken === process.env.SERVICE_TOKEN) return { token: accessToken }; 
                return false;
            }
        },
        verify: {
            params: {
                token: { type: "string" }
            },
            async handler(ctx) {
                this.logger.info("acl.verified called", { params: ctx.params, meta: ctx.meta } );
                return { 
                    acl: {
                        accessToken: ctx.params.token,
                        ownerId: ownerId,
                        role: "admin",
                        unrestricted: true
                    } 
                };
            }
        }
    }
};


// mock service rules
let ruleResult;
const Rules = {
    name: "rules",
    actions: {
        eval: {
            params: {
                name: [{ type: "string" },{ type: "array" }],
                data: { type: "object" }
            },
            async handler(ctx) {
                this.logger.info("rules.eval called", { params: ctx.params } );
                return ruleResult;
            }
        }
    }
};

// service test
let actionResult;
const Test = {
    name: "test",
    actions: {
        actionA: {
            params: {
                a: { type: "string" }
            },
            async handler(ctx) {
                this.logger.info("test.actionA called", { params: ctx.params } );
                return actionResult;
            }
        }
    }
};


function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

describe("Test handler service", () => {

    let broker, service, contextService, streamsService, queryService, aclService, rulesService, testService;
    beforeAll(() => {
    });
    
    afterAll(() => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info", //"debug"
                middlewares: [AclMiddleware({service: "acl"})]
            });
            contextService = await broker.createService(Context);
            streamsService = await broker.createService(Streams);
            queryService = await broker.createService(Query);
            aclService = await broker.createService(ACL);
            rulesService = await broker.createService(Rules);
            testService = await broker.createService(Test);
            service = await broker.createService(Token, Object.assign({ 
                name: "token", 
                settings: {
                    services: {
                        streams: "streams",
                        context: "flow.context",
                        query: "flow.query",
                        acl: "acl"
                    }
                }
            }));
            await broker.start();
            expect(contextService).toBeDefined();
            expect(streamsService).toBeDefined();
            expect(queryService).toBeDefined();
            expect(aclService).toBeDefined();
            expect(rulesService).toBeDefined();
            expect(testService).toBeDefined();
            expect(service).toBeDefined();
        });

    });

    describe("Test update token", () => {
        
        let opts, instanceId, tokenA, tokenB, tokenC;
        
        beforeEach(() => {
            opts = { 
                meta: meta
            };
        });
        
        it("it should emit token A", async () => {
            instanceId = uuid();
            tokenA = {
                processId: uuid(),
                instanceId: uuid(),
                elementId: uuid(),
                status: Constants.ACTIVITY_ACTIVATED
            };
            let params = {
                instanceId: instanceId,
                emit: [tokenA]
            };
            token = [];
            let res = await broker.call("token.update", params, opts);
            await sleep(50);
            expect(res).toEqual(true);
            expect(token.length).toEqual(1);
            expect(token[0]).toEqual(tokenA);
            
        });
 
        it("it should consume token A and emit token B and C", async () => {
            instanceId = uuid();
            tokenB = {
                processId: uuid(),
                instanceId: uuid(),
                elementId: uuid(),
                status: Constants.ACTIVITY_ACTIVATED
            };
            tokenC = {
                processId: uuid(),
                instanceId: uuid(),
                elementId: uuid(),
                status: Constants.ACTIVITY_ACTIVATED
            };
            let params = {
                instanceId: instanceId,
                consume: [tokenA],
                emit: [tokenB,tokenC]
            };
            let res = await broker.call("token.update", params, opts);
            await sleep(50);
            expect(res).toEqual(true);
            expect(token.length).toEqual(2);
            expect(token[0]).toEqual(tokenB);
            expect(token[1]).toEqual(tokenC);
            
        });
        
        it("it should consume token B and C", async () => {
            instanceId = uuid();
            let params = {
                instanceId: instanceId,
                consume: [tokenB,tokenC]
            };
            let res = await broker.call("token.update", params, opts);
            await sleep(50);
            expect(res).toEqual(true);
            expect(token.length).toEqual(0);
            
        });
        
    });
    
    describe("Test event", () => {

        let opts;
        
        beforeEach(() => {
            opts = { 
                meta: meta
            };
        });
        
        it("it should emit event occured token", () => {
            let params = {
                processId: uuid(),
                instanceId: uuid(),
                elementId: uuid(),
                type: Constants.DEFAULT_EVENT,
                status: Constants.EVENT_ACTIVATED,
                user: meta.user,
                ownerId: meta.ownerId
            };
            token = [];
            stream = [];
            return broker.call("token.handle", params, opts).then(res => {
                let newToken = params;
                newToken.status = Constants.EVENT_OCCURED;
                expect(res).toEqual(true);
                expect(token[0]).toEqual(newToken);
                expect(stream[0]).toEqual(newToken);
            });
            
        });
        
        it("it should activate next", () => {
            let params = {
                processId: uuid(),
                instanceId: uuid(),
                elementId: uuid(),
                type: Constants.DEFAULT_EVENT,
                status: Constants.EVENT_OCCURED,
                user: meta.user,
                ownerId: meta.ownerId
            };
            process.next = [{ processId: params.processId, uid: uuid(), type: Constants.SEQUENCE_STANDARD }];
            token = [];
            stream = [];
            return broker.call("token.handle", params, opts).then(res => {
                expect(res).toEqual(true);
                let token1 = {
                    processId: params.processId,
                    instanceId: params.instanceId,
                    elementId: process.next[0].uid,
                    type: process.next[0].type,
                    status: Constants.SEQUENCE_ACTIVATED,
                    user: params.user,
                    ownerId: meta.ownerId
                };
                expect(token[0]).toEqual(token1);
                expect(stream[0]).toEqual(token1);
            });
            
        });
        
    });
    
    describe("Test sequence", () => {

        let opts;
        
        beforeEach(() => {
            opts = { 
                meta: meta
            };
        });        

        it("it should emit sequence completed token", () => {
            let params = {
                processId: uuid(),
                instanceId: uuid(),
                elementId: uuid(),
                type: Constants.SEQUENCE_STANDARD,
                status: Constants.SEQUENCE_ACTIVATED,
                user: meta.user,
                ownerId: meta.ownerId
            };
            token = [];
            stream = [];
            return broker.call("token.handle", params, opts).then(res => {
                let newToken = params;
                newToken.status = Constants.SEQUENCE_COMPLETED;
                expect(res).toEqual(true);
                expect(token[0]).toEqual(newToken);
                expect(stream[0]).toEqual(newToken);
            });
            
        });
        
        
        it("it should activate next", () => {
            let params = {
                processId: uuid(),
                instanceId: uuid(),
                elementId: uuid(),
                type: Constants.SEQUENCE_STANDARD,
                status: Constants.SEQUENCE_COMPLETED,
                user: meta.user,
                ownerId: meta.ownerId
            };
            process.next = [{ processId: params.processId, uid: uuid(), type: Constants.SERVICE_TASK },
                            { processId: params.processId, uid: uuid(), type: Constants.SERVICE_TASK }];
            token = [];
            stream = [];
            return broker.call("token.handle", params, opts).then(res => {
                expect(res).toEqual(true);
                let token1 = {
                    processId: params.processId,
                    instanceId: params.instanceId,
                    elementId: process.next[0].uid,
                    type: process.next[0].type,
                    status: Constants.ACTIVITY_ACTIVATED,
                    user: params.user,
                    ownerId: meta.ownerId
                };
                let token2 = {
                    processId: params.processId,
                    instanceId: params.instanceId,
                    elementId: process.next[1].uid,
                    type: process.next[1].type,
                    status: Constants.ACTIVITY_ACTIVATED,
                    user: params.user,
                    ownerId: meta.ownerId
                };
                expect(token[0]).toEqual(token1);
                expect(token[1]).toEqual(token2);
                expect(stream[0]).toEqual(token1);
                expect(stream[1]).toEqual(token2);
            });
            
        });
        
    });
    
    
    describe("Test process", () => {

        /*
        it("it should emit start event activated token", () => {
            let params = {
                processId: uuid(),
                instanceId: uuid(),
                status: Constants.PROCESS_ACTIVATED
            };
            tokens = [];
            return broker.call("token.handle", params, opts).then(res => {
                let token = params;
                token.step = process.defaultEvent.id;
                token.status = Constants.EVENT_ACTIVATED;
                expect(res).toEqual(true);
                expect(tokens[0]).toEqual(token);
            });
            
        });
        */
 
    });
    

    /*
    describe("Test sequence", () => {

        it("it should emit completed token", () => {
            let params = {
                processId: uuid(),
                instanceId: uuid(),
                elementId: uuid(),
                status: Constants.SEQUENCE_ACTIVATED
            };
            process.current = {
                processId: params.processId,
                uid: params.elementId,
                ownerId: ownerId,        
                type: Constants.SEQUENCE_STANDARD
            };
            tokens = [];
            return broker.call("token.handle", params).then(res => {
                let token = params;
                token.status = Constants.SEQUENCE_COMPLETED;
                expect(res).toEqual(true);
                expect(tokens[0]).toEqual(token);
            });
            
        });
        
        it("it should emit activity activated token", () => {
            let params = {
                processId: uuid(),
                instanceId: uuid(),
                elementId: uuid(),
                status: Constants.SEQUENCE_COMPLETED
            };
            process.next = [{
                processId: params.processId,
                uid: uuid(),
                name: "Next Task",
                ownerId: ownerId,        
                type: Constants.MANUAL_TASK
                //attributes: task.attributes ? JSON.stringify(task.attributes) : "."
            }];
            tokens = [];
            return broker.call("token.handle", params).then(res => {
                let token = params;
                token.elementId = process.next[0].uid;
                token.status = Constants.ACTIVITY_ACTIVATED;
                expect(res).toEqual(true);
                expect(tokens[0]).toEqual(token);
            });
            
        });
    });
    */

    describe("Test event-based gateway", () => {

        
    });
    
    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });    
    
});