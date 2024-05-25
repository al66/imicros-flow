"use strict";

const { ServiceBroker } = require("moleculer");
const { AclMiddleware } = require("imicros-acl");
const { Context, Factory, Instance, Activity, Sequence, Gateway, Event } = require("../lib/process/main");

// helper & mocks
const { ACL, meta, user } = require("./helper/acl");
const { Parser } = require("../lib/parser/basic");
const { DB } = require("../lib/db/cassandra");
const { Keys } = require("./helper/keys");
const { Agents } = require("./helper/agents");
const { credentials } = require("./helper/credentials");
const Constants = require("../lib/util/constants");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const util = require("util");

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
    agents: "agents"
}

const xmlData = fs.readFileSync("assets/Process Example.bpmn");

describe("Test flow service", () => {

    let broker, db, parsedData, element;

    describe("Test start broker and connect to db", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                middlewares:  [AclMiddleware({ service: "acl" })],
                logger: console,
                logLevel: "info" //"debug"
            });
            broker.createService(ACL);
            broker.createService(Agents);
            broker.createService(Keys);
            db = new DB({broker, options: settings.db, services});
            await db.connect();
            Context.set({ broker, db, services, serviceId: credentials.serviceId, serviceToken: credentials.serviceToken });
            expect(db).toBeDefined();
            expect(db instanceof DB).toEqual(true);
            await broker.start();
            await broker.waitForServices([{ name: "keys", version: 1},{ name:"agents" }]);
            expect(broker).toBeDefined();
        });

        /*
        it("it should instantiate db", async () => {
            db = new DB({broker, options: settings.db, services});
            await db.connect();
            Context.set({ broker, db, services, serviceId: credentials.serviceId, serviceToken: credentials.serviceToken });
            expect(db).toBeDefined();
            expect(db instanceof DB).toEqual(true);
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

    });

    describe("Test Instance class", () => {

        it("it should instantiate an element of the process", async () => {
            const token = {
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId: uuid(),
                elementId: parsedData.task[0].id,
                type: parsedData.task[0].type,
                status: Constants.ACTIVITY_ACTIVATED,
                user,
                ownerId: credentials.ownerId,
                attributes: {}
            };
            const instance = await Instance.getInstance({ token });
            element = await instance.getElement({ token });
            expect(element).toBeDefined();
            expect(element instanceof Activity).toEqual(true);

        });

        it("it should retrieve a sequence by the process attribute of the element", async () => {
            element = await element.process.getElement({ elementId: parsedData.sequence[0].id });
            expect(element).toBeDefined();
            expect(element instanceof Sequence).toEqual(true);
            expect(element.data.id).toEqual(parsedData.sequence[0].id);
        });

        it("it should retrieve an actvity by the process attribute of the element", async () => {
            element = await element.process.getElement({ elementId: parsedData.task[1].id });
            expect(element).toBeDefined();
            expect(element instanceof Activity).toEqual(true);
            expect(element.data.id).toEqual(parsedData.task[1].id);
        });

        it("it should retrieve an event by the process attribute of the element", async () => {
            element = await element.process.getElement({ elementId: parsedData.event[0].id });
            expect(element).toBeDefined();
            expect(element instanceof Event).toEqual(true);
            expect(element.data.id).toEqual(parsedData.event[0].id);
        });
    });

    describe("Test activity class", () => {
        it("it should prepare an activity", async () => {
            const token = {
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId: uuid(),
                elementId: parsedData.task[2].id,
                type: parsedData.task[2].type,
                status: Constants.ACTIVITY_ACTIVATED,
                user,
                ownerId: credentials.ownerId,
                attributes: {}
            };
            await db.addContextKey ({ opts: meta, instanceId: token.instanceId, key: "creditData", value: { "riskClass": "A" } });
            // standard call
            let result = await Instance.processToken({ token });
            // check
            expect(result).toEqual(true);
            let log = await db.getToken ({ opts: meta , instanceId: token.instanceId });
            expect(log.active).toContainEqual(expect.objectContaining({elementId: token.elementId, status: Constants.ACTIVITY_READY }));
        });

        it("it should activate the following sequence", async () => {
            const token = {
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId: uuid(),
                elementId: parsedData.task[2].id,
                type: parsedData.task[2].type,
                status: Constants.ACTIVITY_COMPLETED,
                user,
                ownerId: credentials.ownerId,
                attributes: {}
            };
            // standard call
            let result = await Instance.processToken({ token });
            // check
            expect(result).toEqual(true);
            let next = await db.getNext ({ opts: meta , processId: token.processId, versionId: token.versionId, elementId: token.elementId });
            expect(next.length).toEqual(1);
            let log = await db.getToken ({ opts: meta , instanceId: token.instanceId });
            // console.log(util.inspect(log, { showHidden: false, depth: null, colors: true }));
            expect(log.active).toContainEqual(expect.objectContaining({elementId: next[0].id, status: Constants.SEQUENCE_ACTIVATED }));
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
