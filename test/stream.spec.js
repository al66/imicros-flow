"use strict";

const { ServiceBroker } = require("moleculer");
const { AclMiddleware } = require("imicros-acl");
const { Stream } = require("../index");

const {ServiceAPI, Context, DeploymentManager } = require("../lib/process/main");
const { DB } = require("../lib/db/cassandra");

// helper & mocks
const { ACL, meta, user } = require("./helper/acl");
const { Keys } = require("./helper/keys");
const { Agents } = require("./helper/agents");
const { MyService, test } = require("./helper/my");
const { Feel, setFeelRequest } = require("./helper/feel");
const { Queue, getQueue, clearQueue } = require("./helper/queue");
const { credentials } = require("./helper/credentials");
const { Collect, clear } = require("./helper/collect");

const calls = [];

const fs = require("fs");
const util = require("util");

const xmlData = fs.readFileSync("assets/Process A.bpmn");

describe("Test Process F", () => {

    let broker, processId, versionId, instanceId;

    describe("Test start the broker", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                middlewares:  [AclMiddleware({ service: "acl" })],
                logger: console,
                logLevel: "info" //"debug"
            });
            broker.createService(Stream, Object.assign({ 
                settings: { 
                    db: { 
                        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                        keyspace: process.env.CASSANDRA_KEYSPACE_FLOW || "imicros_flow",
                        contextTable: "context",
                        instanceTable: "instances",
                        tokenTable: "log"
                    },
                    services: {
                        acl: "acl",
                        agents: "agents",
                        keys: "v1.keys",
                        queue: "queue",
                        feel: "feel"
                    }
                } 
            }));
            broker.createService(ACL);
            broker.createService(Agents);
            broker.createService(Keys);
            broker.createService(Queue);
            broker.createService(Feel);
            broker.createService(MyService);
            broker.createService(Object.assign(Collect,{ settings: { calls: calls }}));
            await broker.start();
            expect(broker).toBeDefined();
        });
    });

    describe("Test deploy process", () => {
        it("should deploy a process", async () => {
            const result = await DeploymentManager.deployProcess({ xmlData, objectName: "process A", meta });
            expect(result).toBeDefined();
            processId = result.processId;
            versionId = result.versionId;
        });
        it("should activate the process", async () => {
            const result = await DeploymentManager.activateVersion({ processId, versionId, meta });
            expect(result).toBeDefined();
        });
    });
    
    describe("Test the stream service", () => {
        it("should raise the start event", async () => {
            const eventName = 'order.saved'
            const payload = {
                orderNumber: '123456'
            }
            // call
            const result = await ServiceAPI.raiseEvent ({ eventName, payload, meta } )
            expect(result).toBeDefined();
            // console.log(result);
            // check
            expect(calls["flow.instance.created"]).toHaveLength(1);
            instanceId = calls["flow.instance.created"][0].payload.instanceId;
            // console.log(instanceId);
        });

        it("should complete the instance", async () => {
            // wait 1000 ms to give enough time to complete the process
            await new Promise(resolve => setTimeout(resolve, 1000));
            expect(calls["flow.instance.completed"]).toHaveLength(1);
            expect(calls["flow.instance.completed"][0].payload).toEqual(expect.objectContaining({
                ownerId: meta.acl.ownerId,
                processId,
                versionId,
                instanceId
            }));
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