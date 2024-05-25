"use strict";

const { ServiceBroker } = require("moleculer");
const { AclMiddleware } = require("imicros-acl");
const { Context, DeploymentManager, Instance, ServiceAPI, Activity, Sequence, Gateway, Event } = require("../lib/process/main");

// helper & mocks
const { ACL, meta, user } = require("./helper/acl");
const { Parser } = require("../lib/parser/basic");
const { DB } = require("../lib/db/cassandra");
const { Keys } = require("./helper/keys");
const { Agents } = require("./helper/agents");
const { MyService, test } = require("./helper/my");
const { Feel, setFeelRequest } = require("./helper/feel");
const { Queue, getQueue, clearQueue } = require("./helper/queue");
const { credentials } = require("./helper/credentials");
const Constants = require("../lib/util/constants");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const util = require("util");
const { Collect, clear } = require("./helper/collect");
const { call } = require("./helper/action");

const calls = [];
const CollectEvents = Object.assign(Collect,{ settings: { calls: calls }});

const settings = {
    db: { 
        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
        keyspace: process.env.CASSANDRA_KEYSPACE_FLOW || "imicros_flow",
        contextTable: "context",
        instanceTable: "instances",
        tokenTable: "log"
    } 
}

const services = {
    keys: "v1.keys",
    agents: "agents",
    feel: "feel",
    queue: "queue"
}

const xmlData = fs.readFileSync("assets/Process D.bpmn");

describe("Test Process D", () => {

    let broker, db, factory, parsedData, element, instanceId, token;

    beforeEach(async () => {
        await clear(calls);
        clearQueue();
    });

    describe("Test start broker and connect to db", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                middlewares:  [AclMiddleware({ service: "acl" })],
                logger: console,
                logLevel: "info" //"debug"
            });
            broker.createService(ACL);
            broker.createService(Agents);
            broker.createService(Feel);
            broker.createService(MyService);
            broker.createService(Queue);
            broker.createService(Keys);
            broker.createService(CollectEvents);
            db = new DB({broker, options: settings.db, services});
            await db.connect();
            expect(db).toBeDefined();
            expect(db instanceof DB).toEqual(true);
            Context.set({ broker, db, services, serviceId: credentials.serviceId, serviceToken: credentials.serviceToken });
            await broker.start();
            expect(broker).toBeDefined();
        });

        /*
        it("it should instantiate db", async () => {
            db = new DB({broker, options: settings.db, services});
            await db.connect();
            expect(db).toBeDefined();
            expect(db instanceof DB).toEqual(true);
            Context.set({ broker, db, services, serviceId: credentials.serviceId, serviceToken: credentials.serviceToken });
        });
        */

        it("it should parse and deploy the process", async () => {
            const parser = new Parser({broker});
            let id = uuid();
            let objectName = "Process Example";
            let ownerId = credentials.ownerId;
            parsedData = parser.parse({id, xmlData, objectName, ownerId});
            expect(parsedData).toBeDefined();
            expect(parsedData.process.id).toEqual(id);
            expect(parsedData.process.name).toEqual(objectName);
            console.log(util.inspect(parsedData, { showHidden: false, depth: null, colors: true }));
            let params = {
                opts: meta,
                xmlData,
                parsedData
            };
            return db.saveProcess(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    processId: parsedData.process.id,
                    versionId: parsedData.version.id
                });
            });
        });

        it("it should activate the version", () => {
            let params = {
                opts: meta,
                processId: parsedData.process.id,
                versionId: parsedData.version.id
            };
            return db.activateVersion(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    processId: parsedData.process.id,
                    versionId: parsedData.version.id
                });
            });
            
        });

    });

    describe("Test process execution", () => {

        it("it should raise the event", async () => {
            const eventName = 'order.saved'
            const payload = {
                orderNumber: '123456'
            }
            // call
            await ServiceAPI.raiseEvent ({ eventName, payload, meta } )
            // check
            expect(calls["flow.instance.created"]).toHaveLength(1);
            instanceId = calls["flow.instance.created"][0].payload.instanceId;
            const value = await db.getContextKey({ opts:meta, instanceId, key: "order" })
            expect(value).toEqual(payload);
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.DEFAULT_EVENT,
                status: Constants.EVENT_ACTIVATED,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {}
            }));
        });

        it("it should prepare the event", async () => {
            // call
            await Instance.processToken({ token });
            // check
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.DEFAULT_EVENT,
                status: Constants.EVENT_READY,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {}
            }));
        });

        it("it should process the event", async () => {
            // call
            await Instance.processToken({ token });
            // check
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.DEFAULT_EVENT,
                status: Constants.EVENT_OCCURED,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {}
            }));
        });

        it("it should activate the sequence to task", async () => {
            // call
            await Instance.processToken({ token });
            // check
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.SEQUENCE_STANDARD,
                status: Constants.SEQUENCE_ACTIVATED,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {
                    lastToken: expect.any(Object)
                }
            }));
        });

        it("it should process the sequence to task", async () => {
            // call
            await Instance.processToken({ token });
            // check
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.SEQUENCE_STANDARD,
                status: Constants.SEQUENCE_COMPLETED,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {
                    lastToken: expect.any(Object)
                }
            }));
        });

        it("it should activate the task", async () => {
            // call
            await Instance.processToken({ token });
            // check
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.SERVICE_TASK,
                status: Constants.ACTIVITY_ACTIVATED,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {
                    lastToken: expect.any(Object)
                }
            }));
        });

        it("it should process the service task preparation", async () => {
            // call
            await Instance.processToken({ token });
            // check
            const value = await db.getContextKey({ opts:meta, instanceId, key: "param" });
            expect(value).toEqual(expect.objectContaining({
                number: "123456",
                status: "new"
            }));
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.SERVICE_TASK,
                status: Constants.ACTIVITY_READY,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {
                    lastToken: expect.any(Object)
                }
            }));
        });

        it("it should queue the task for the service", async () => {
            // call
            await Instance.processToken({ token });
            // check
            expect(calls["flow.token.emit"]).toHaveLength(0);
            const queue = getQueue();
            expect(queue[0].params).toEqual(expect.objectContaining({
                serviceId: expect.any(String),
                value: expect.any(Object),
                token
            }));
        });

        it("it should complete the task", async () => {
            console.log(util.inspect(calls["flow.token.emit"], { showHidden: false, depth: null, colors: true }));
            const result = {
                accepted: true 
            }
            // call
            await ServiceAPI.completed({ token, result });
            // check
            const value = await db.getContextKey({ opts:meta, instanceId, key: "result" })
            expect(value).toEqual(result);
            console.log(util.inspect(calls["flow.token.emit"], { showHidden: false, depth: null, colors: true }));
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.SERVICE_TASK,
                status: Constants.ACTIVITY_COMPLETED,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {
                    lastToken: expect.any(Object)
                }
            }));
        });

        it("it should activate the sequence to the end event", async () => {
            // call
            await Instance.processToken({ token });
            // check
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.SEQUENCE_STANDARD,
                status: Constants.SEQUENCE_ACTIVATED,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {
                    lastToken: expect.any(Object)
                }
            }));
        });

        it("it should process the sequence to the end event", async () => {
            // call
            await Instance.processToken({ token });
            // check
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.SEQUENCE_STANDARD,
                status: Constants.SEQUENCE_COMPLETED,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {
                    lastToken: expect.any(Object)
                }
            }));
        });

        it("it should activate the end event", async () => {
            // call
            await Instance.processToken({ token });
            // check
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.DEFAULT_EVENT,
                status: Constants.EVENT_ACTIVATED,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {
                    lastToken: expect.any(Object)
                }
            }));
        });

        it("it should prepare the end event", async () => {
            // call
            await Instance.processToken({ token });
            // check
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.DEFAULT_EVENT,
                status: Constants.EVENT_READY,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {
                    lastToken: expect.any(Object)
                }
            }));
        });

        it("it should throw the end event", async () => {
            // call
            await Instance.processToken({ token });
            // check
            expect(calls["flow.token.emit"]).toHaveLength(1);
            token = calls["flow.token.emit"][0].payload.token;
            expect(token).toEqual(expect.objectContaining({
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId,
                elementId: expect.any(String),
                type: Constants.DEFAULT_EVENT,
                status: Constants.EVENT_OCCURED,
                user: meta.user,
                ownerId: meta.acl.ownerId,
                attributes: {
                    lastToken: expect.any(Object)
                }
            }));
        });

        it("it should terminate the instance", async () => {
            // call
            await Instance.processToken({ token });
            // check
            const info = await db.getToken ({ opts: meta, instanceId: token.instanceId });
            expect(info.instanceId).toEqual(instanceId);
            expect(info.active.length).toEqual(0);
            expect(calls["flow.instance.completed"]).toHaveLength(1);
            expect(calls["flow.instance.completed"][0].payload).toEqual(expect.objectContaining({
                ownerId: meta.acl.ownerId,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId
            }));
        });

 });

    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await db.disconnect();
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });

});