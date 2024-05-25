"use strict";

const { ServiceBroker } = require("moleculer");
const { AclMiddleware } = require("imicros-acl");
const {Context, DeploymentManager, Instance, ServiceAPI, Activity, Sequence, Gateway, Event } = require("../lib/process/main");

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

const xmlData = fs.readFileSync("assets/Process G.bpmn");

describe("Test Process G", () => {

    let broker, db, parsedData, element, instanceId, token, tokenB;

    beforeEach(() => {
        clear(calls);
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
            await broker.waitForServices([{ name: "keys", version: 1},{ name:"agents" }]);
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

        it("it should schedule a new instance token", async () => {
            const result = await db.readScheduledToken({ time: new Date("2022-08-28T09:00:00Z") });
            // console.log(result);
            expect(result).toContainEqual(expect.objectContaining({
                id: expect.any(String),
                time: new Date("2022-08-28T09:00:00Z"),
                payload: {
                    timer: expect.any(Object),
                    token: expect.any(Object)
                }
            }))
            const entry = result.find(element => element.payload?.token?.ownerId === credentials.ownerId);
            expect(entry).toBeDefined();
            token = entry.payload.token;
            instanceId = token.instanceId;
        }); 

    });

    describe("Test process execution", () => {

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
                type: Constants.TIMER_EVENT,
                status: Constants.EVENT_READY,
                user: {
                    id: meta.user.id
                },
                ownerId: meta.acl.ownerId,
                attributes: {
                    time: expect.any(String)
                }
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
                type: Constants.TIMER_EVENT,
                status: Constants.EVENT_OCCURED,
                user: {
                    id: meta.user.id
                },
                ownerId: meta.acl.ownerId,
                attributes: expect.any(Object)
            }));
        });

        it("it should schedule a new instance token", async () => {
            const result = await db.readScheduledToken({ time: new Date("2022-08-29T09:00:00Z") });
            // console.log(result);
            expect(result).toContainEqual(expect.objectContaining({
                id: expect.any(String),
                time: new Date("2022-08-29T09:00:00Z"),
                payload: {
                    timer: expect.any(Object),
                    token: expect.any(Object)
                }
            }))
            const entry = result.find(element => element.payload?.token?.ownerId === credentials.ownerId);
            expect(entry).toBeDefined();
        }); 

        it("it should activate the sequence to the task", async () => {
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
                user: {
                    id: meta.user.id
                },
                ownerId: meta.acl.ownerId,
                attributes: {
                    lastToken: expect.any(Object)
                }
            }));
        });

        // the following steps are already covered by the other tests...

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