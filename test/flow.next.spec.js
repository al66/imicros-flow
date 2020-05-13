"use strict";

const { ServiceBroker } = require("moleculer");
const { Next } = require("../index");
const { Constants } = require("imicros-flow-control");
const { v4: uuid } = require("uuid");
const _ = require("lodash");

const timestamp = Date.now();
const ownerId = uuid();
const meta = { 
    ownerId: ownerId,
    acl: {
        accessToken: "this is the access token",
        ownerId: ownerId
    }, 
    user: { 
        id: `1-${timestamp}` , 
        email: `1-${timestamp}@host.com` }
}; 


// mock service flow.token
let tokens = [];
const Token = {
    name: "flow.token",
    actions: {
        handle: {
            params: {
                processId: { type: "uuid" },
                instanceId: { type: "uuid" },
                elementId: { type: "uuid", optional: true },
                type: { type: "string" },
                status: { type: "string" },
                user: { type: "object" },
                ownerId: { type: "string" }
            },
            handler(ctx) {
                this.logger.info("token.handle called", { params: ctx.params } );
                tokens.push(ctx.params);
                return true;
            }
        }
    }
};

// mock service streams
let stream = [];
const Streams = {
    name: "streams",
    actions: {
        read: {
            params: {
                group: { type: "string" },
                count: { type: "number" },
                stream: { type: "string" }
            },
            async handler(ctx) {
                this.logger.debug("streams.read called", { params: ctx.params, meta: ctx.meta, stream: stream } );
                //if (ctx.meta.user === meta.user) return { token: accessToken }; 
                if (stream.length > 0) return [ { message: stream.pop(), stream: ctx.params.stream, id: uuid() } ];
                return null;
            }
        },
        ack: {
            params: {
                group: { type: "string" },
                stream: { type: "string" },
                messages: { type: "array", items: "string" }
            },
            async handler(ctx) {
                this.logger.debug("streams.ack called", { params: ctx.params, meta: ctx.meta, stream: stream } );
                return { count: ctx.params.messages.length };
            }
        }
    }
};

describe("Test next service", () => {

    let broker, service, tokenService, streamsService;
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
            tokenService = await broker.createService(Token);
            streamsService = await broker.createService(Streams);
            service = await broker.createService(Next, Object.assign({ 
                name: "flow.next", 
                settings: {
                    streams: {
                        stream: "token",
                        group: "token",
                        service: "streams"
                    },
                    services: {
                        token: "flow.token",
                        service: "streams"
                    }
                },
                dependencies: ["flow.token", "streams"]
            }));
            await broker.start();
            expect(tokenService).toBeDefined();
            expect(streamsService).toBeDefined();
            expect(service).toBeDefined();
        });

    });

    describe("Test token handler", () => {
    
        beforeEach(() => {
            // tokens = [];
        });
        
        it("it should handle the token", async () => {
            let token = {
                processId: uuid(),
                instanceId: uuid(),
                elementId: uuid(),
                type: "token type",
                status: "token status",
                user: meta.user,
                ownerId: meta.ownerId
            };
            stream.push(token);
            function sleep(milliseconds) {
                return new Promise(resolve => setTimeout(resolve, milliseconds));
            }
            expect.assertions(2);
            return sleep(50).then(() => {
                expect(tokens.length).toEqual(1);
                expect(tokens[0]).toEqual(expect.objectContaining(token));
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