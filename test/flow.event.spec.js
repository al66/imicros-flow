"use strict";

const { ServiceBroker } = require("moleculer");
const { Event } = require("../index");
const { Constants } = require("imicros-flow-control");
const { AclMiddleware } = require("imicros-acl");
const { v4: uuid } = require("uuid");
const _ = require("lodash");

const timestamp = Date.now();
const ownerId = uuid();
const meta = { 
    ownerId: ownerId,
    /*
    acl: {
        accessToken: "this is the access token",
        ownerId: ownerId
    },
    */
    user: { 
        id: `1-${timestamp}` , 
        email: `1-${timestamp}@host.com` }
}; 


// mock service flow.query
let subscriptions = [];
const Query = {
    name: "flow.query",
    actions: {
        subscriptions: {
            params: {
                name: { type: "string" },
                version: { type: "string", optional: true },
                id: { type: "string", optional: true },
                processId: { type: "uuid", optional: true },
                elementId: { type: "uuid", optional: true },
                instanceId: { type: "uuid", optional: true }
            },
            handler(ctx) {
                this.logger.info("query.subscriptions called", { params: ctx.params, meta: ctx.meta });
                return subscriptions;
            }
        }
    }
};

// mock service flow.token
let token = [];
const Token = {
    name: "flow.token",
    actions: {
        update: {
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
            handler(ctx) {
                this.logger.info("token.update called", { instanceId: ctx.params.instanceId, consume: ctx.params.consume, emit: ctx.params.emit } );
                if (ctx.params.consume) ctx.params.consume.map(c => { token = token.filter(t => t !==  c); });
                if (ctx.params.emit) ctx.params.emit.map(t => token.push(t));
                return true;
            }
        }
    }
};

// mock service flow.context
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
                return true;
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
                this.logger.info("acl.requestAccess called", { caller: ctx.caller, params: ctx.params, meta: ctx.meta } );
                if (ctx.meta.user === meta.user) return { token: accessToken }; 
                return false;
            }
        },
        verify: {
            params: {
                token: { type: "string" }
            },
            async handler(ctx) {
                this.logger.info("acl.verified called", { caller: ctx.caller, params: ctx.params, meta: ctx.meta } );
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

describe("Test event service", () => {

    let broker, service, queryService, contextService, tokenService, aclService;
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
            queryService = await broker.createService(Query);
            contextService = await broker.createService(Context);
            tokenService = await broker.createService(Token);
            aclService = await broker.createService(ACL);
            service = await broker.createService(Event, Object.assign({ 
                name: "flow.event", 
                settings: {
                    services: {
                        query: "flow.query",
                        context: "flow.context",
                        token: "flow.token"
                    }
                },
                dependencies: ["flow.context", "flow.token", "flow.query"]
            }));
            await broker.start();
            expect(queryService).toBeDefined();
            expect(contextService).toBeDefined();
            expect(tokenService).toBeDefined();
            expect(aclService).toBeDefined();
            expect(service).toBeDefined();
        });

    });

    describe("Test event handler", () => {
    
        let opts;
        
        beforeEach(() => {
            opts = { 
                meta: meta
            };
            token = [];
        });
        
        it("it should push one subscription to the queue", () => {
            let params = {
                offset: "123",
                event: "first event",
                payload: {
                    param1: 1,
                    param2: "first"
                },
                version: "1",
                uid: uuid(),
                timestamp: Date.now()
            };
            subscriptions = [{
                processId: uuid(),
                elementId: uuid(),
                ownerId: ownerId,
                type: Constants.DEFAULT_EVENT
            }];
            _.set(opts.meta,"flow.processId",subscriptions[0].processId);
            _.set(opts.meta,"flow.instanceId",uuid());
            return broker.call("flow.event.handle", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(token.length).toEqual(1);
                //console.log(token);
                expect(token[0]).toEqual(expect.objectContaining({
                    processId: subscriptions[0].processId,
                    instanceId: opts.meta.flow.instanceId,
                    elementId: subscriptions[0].elementId,
                    type: subscriptions[0].type,
                    status: Constants.EVENT_ACTIVATED,
                    user: opts.meta.user,
                    ownerId: ownerId
                }));
                
            });
            
        });
        
        it("it should push two subscriptions to the queue", () => {
            let params = {
                offset: "124",
                event: "first event",
                payload: {
                    param1: 1,
                    param2: "first"
                },
                version: "1",
                uid: uuid(),
                timestamp: Date.now()
            };
            subscriptions = [{
                processId: uuid(),
                elementId: uuid(),
                ownerId: ownerId,
                type: Constants.DEFAULT_EVENT
            },{
                processId: uuid(),
                elementId: uuid(),
                ownerId: ownerId,
                type: Constants.MESSAGE_EVENT
            }];
            _.set(opts.meta,"flow.processId",subscriptions[0].processId);
            _.set(opts.meta,"flow.instanceId",uuid());
            return broker.call("flow.event.handle", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(token.length).toEqual(2);
                //console.log(token);
                expect(token[0]).toEqual(expect.objectContaining({
                    processId: subscriptions[0].processId,
                    instanceId: opts.meta.flow.instanceId,
                    elementId: subscriptions[0].elementId,
                    type: subscriptions[0].type,
                    status: Constants.EVENT_ACTIVATED,
                    user: opts.meta.user,
                    ownerId: ownerId
                }));
                expect(token[1]).toEqual(expect.objectContaining({
                    processId: subscriptions[1].processId,
                    // instanceId: new uuid,
                    elementId: subscriptions[1].elementId,
                    type: subscriptions[1].type,
                    status: Constants.EVENT_ACTIVATED,
                    user: opts.meta.user,
                    ownerId: ownerId
                }));
                
            });
            
        });
        
        it("it should push no subscription to the queue - query returns empty array", () => {
            let params = {
                offset: "125",
                event: "first event",
                payload: {
                    param1: 1,
                    param2: "first"
                },
                version: "1",
                uid: uuid(),
                timestamp: Date.now()
            };
            subscriptions = [];
            _.set(opts.meta,"flow.processId",uuid());
            _.set(opts.meta,"flow.instanceId",uuid());
            return broker.call("flow.event.handle", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(token.length).toEqual(0);
                //console.log(token);
            });
            
        });
        
        it("it should push no subscription to the queue - query returns null", () => {
            let params = {
                offset: "126",
                event: "first event",
                payload: {
                    param1: 1,
                    param2: "first"
                },
                version: "1",
                uid: uuid(),
                timestamp: Date.now()
            };
            subscriptions = null;
            _.set(opts.meta,"flow.processId",uuid());
            _.set(opts.meta,"flow.instanceId",uuid());
            return broker.call("flow.event.handle", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(token.length).toEqual(0);
                //console.log(token);
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