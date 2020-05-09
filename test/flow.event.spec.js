"use strict";

const { ServiceBroker } = require("moleculer");
const { Event } = require("../index");
const { Constants } = require("imicros-flow-control");
const { v4: uuid } = require("uuid");
const _ = require("lodash");

const timestamp = Date.now();
const ownerId = uuid();
const exchangeToken = "access token only valid for access by token service";

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
                this.logger.info("query.subscriptions called", ctx.params);
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
        getExchangeToken: {
            params: {
                accessToken: { type: "string" },
                processId: { type: "uuid" },
                instanceId: { type: "uuid" }
            },
            handler(ctx) {
                this.logger.info("token.getExchangeToken called", { params: ctx.params } );
                return exchangeToken;
            }
        },
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

describe("Test event service", () => {

    let broker, service, queryService, contextService, tokenService;
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
            queryService = await broker.createService(Query);
            contextService = await broker.createService(Context);
            tokenService = await broker.createService(Token);
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
            expect(service).toBeDefined();
        });

    });

    describe("Test event handler", () => {
    
        let opts;
        
        beforeEach(() => {
            opts = { 
                meta: { 
                    ownerId: ownerId,
                    acl: {
                        accessToken: "this is the access token",
                        ownerId: ownerId
                    }, 
                    user: { 
                        id: `1-${timestamp}` , 
                        email: `1-${timestamp}@host.com` }
                } 
            };
            token = [];
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
                processId: uuid(),
                elementId: uuid(),
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
                    accessToken: exchangeToken
                }));
                
            });
            
        });
        
        it("it should push two subscriptions to the queue", () => {
            let params = {
                event: "first event",
                payload: {
                    param1: 1,
                    param2: "first"
                }
            };
            subscriptions = [{
                processId: uuid(),
                elementId: uuid(),
                type: Constants.DEFAULT_EVENT
            },{
                processId: uuid(),
                elementId: uuid(),
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
                    accessToken: exchangeToken
                }));
                expect(token[1]).toEqual(expect.objectContaining({
                    processId: subscriptions[1].processId,
                    // instanceId: new uuid,
                    elementId: subscriptions[1].elementId,
                    type: subscriptions[1].type,
                    status: Constants.EVENT_ACTIVATED,
                    user: opts.meta.user,
                    accessToken: exchangeToken
                }));
                
            });
            
        });
        
        it("it should push no subscription to the queue - query returns empty array", () => {
            let params = {
                event: "first event",
                payload: {
                    param1: 1,
                    param2: "first"
                }
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
                event: "first event",
                payload: {
                    param1: 1,
                    param2: "first"
                }
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