"use strict";
//const mock = require("kafkajs").Kafka;
const { producers } = require("kafkajs");
//jest.unmock("kafka-node");

const { ServiceBroker } = require("moleculer");
const { Publisher } = require("../index");
const { FlowPublishFailedAuthorization } = require("../lib/util/errors");

const timestamp = Date.now();

describe("Test publisher service", () => {

    let broker, service, opts;
    beforeAll(() => {
        broker = new ServiceBroker({
            logger: console,
            logLevel: "debug" //"debug"
        });
        service = broker.createService(Publisher, Object.assign({ settings: { brokers: ["localhost:9092"] } }));
        return broker.start();
    });
    
    afterAll(async () => {
        await broker.stop();
    });
    
    describe("Test create service", () => {

        it("it should be created", () => {
            expect(service).toBeDefined();
            expect(producers.length).toBe(1);
        });
    });

    describe("Test emit event ", () => {

        beforeEach(() => {
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, groupId: `g-${timestamp}`, access: [`g1-${timestamp}`] } };
        });

        it("it should emit event 'test.emit'", () => {
            let params = {
                event: "test.emit",
                payload: { msg: "say hello to the world" }
            };
            return broker.call("flow.publisher.emit", params, opts).then(res => {
                expect(res.success).toBeDefined();
                expect(res.content).toEqual(expect.objectContaining(params));
                expect(res.content.meta).toBeDefined();
            });
        });
        
        it("it should throw FlowPublishFailedAuthorization", async () => {
            let params = {
                event: "test.other",
                owner: "unouthorized group",
                payload: { msg: "say hello to the world" }
            };
            await broker.call("flow.publisher.emit", params, opts).catch(err => {
                expect(err instanceof FlowPublishFailedAuthorization).toBe(true);
                expect(err.group).toEqual("unouthorized group");
            });
        });
        
        it("it should emit event with owner " + `g1-${timestamp}`, () => {
            let params = {
                event: "test.emit",
                owner: `g1-${timestamp}`,
                payload: { msg: "say hello to the world" }
            };
            return broker.call("flow.publisher.emit", params, opts).then(res => {
                expect(res.success).toBeDefined();
                expect(res.content).toEqual(expect.objectContaining(params));
                expect(res.content.meta).toBeDefined();
                expect(res.content.owner).toBe(`g1-${timestamp}`);
            });
        });

        it("it should emit event with owner " + `1-${timestamp}`, () => {
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, access: [`g1-${timestamp}`] } };
            let params = {
                event: "test.emit",
                payload: { msg: "say hello to the world" }
            };
            return broker.call("flow.publisher.emit", params, opts).then(res => {
                expect(res.success).toBeDefined();
                expect(res.content).toEqual(expect.objectContaining(params));
                expect(res.content.meta).toBeDefined();
                expect(res.content.owner).toBe(`1-${timestamp}`);
            });
        });
        
        it("it should emit event w/o owner", () => {
            opts = { };
            let params = {
                event: "test.emit",
                payload: { msg: "say hello to the world" }
            };
            return broker.call("flow.publisher.emit", params, opts).then(res => {
                expect(res.success).toBeDefined();
                expect(res.content).toEqual(expect.objectContaining(params));
                expect(res.content.meta).toBeDefined();
                expect(res.content.owner).toBeUndefined();
            });
        });
        
        it("it should throw an error", async () => {
            let params = {
                event: "test.other",
                payload: { msg: "say hello to the world" }
            };
            producers[0].fail = true;
            await broker.call("flow.publisher.emit", params, opts).catch(err => {
                expect(err instanceof Error).toBe(true);
                expect(err.message).toBe("simulated fail of producer.send");
            });
        });
        
        it("it should emit event to topic 'another'", () => {
            let params = {
                topic: "another",
                event: "test.emit",
                payload: { msg: "say hello to the world" }
            };
            return broker.call("flow.publisher.emit", params, opts).then(res => {
                expect(res.success).toBeDefined();
                expect(res.content).toEqual(expect.objectContaining({event: params.event, payload: params.payload}));
                expect(res.content.meta).toBeDefined();
                expect(res.topic).toEqual("another");
            });
        });
        
    });

    /*
    describe("Test kafka errors ", () => {

        beforeEach(async () => {
        });
        
        afterEach(async () => {
            await broker.stop();
            await broker.start();
        });
        
        it("it should throw FlowPublishLostConnection", async () => {
            let params = {
                event: "test.other",
                payload: { msg: "say hello to the world" }
            };
            await producers[0].emit("error");
            await broker.call("flow.publisher.emit", params, opts).catch(err => {
                expect(err instanceof FlowPublishLostConnection).toBe(true);
                expect(err.message).toBe("any error");
            });
        });
        
        it("it should throw FlowPublishLostConnection", async () => {
            let params = {
                event: "test.other",
                payload: { msg: "say hello to the world" }
            };
            await clients[0].emit("error");
            await broker.call("flow.publisher.emit", params, opts).catch(err => {
                expect(err instanceof FlowPublishLostConnection).toBe(true);
                expect(err.message).toBe("any error");
            });
        });
        
    });
    */
});