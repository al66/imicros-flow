"use strict";

const { ServiceBroker } = require("moleculer");
const { AclMiddleware } = require("imicros-acl");
const { DB } = require("../lib/db/cassandra");
const { Parser } = require("../lib/parser/basic");
const Constants = require("../lib/util/constants");

// helper & mocks
const { ACL, meta, user } = require("./helper/acl");
const { credentials } = require("./helper/credentials");
const { Keys } = require("./helper/keys");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const util = require("util");

const xmlData = fs.readFileSync("assets/Process Example.bpmn");

const settings = {
    db: { 
        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
        keyspace: process.env.CASSANDRA_KEYSPACE_FLOW || "imicros_flow",
        contextTable: "context",
        instanceTable: "instances",
        tokenTable: "log"
    },
    services: {
        keys: "v1.keys"
    } 
}

describe("Test database connection", () => {

    let broker, opts, db, parser, parsedData, element, sequence, instance, time;

    beforeAll(() => {
        time = new Date(Date.now())
    })

    beforeEach(() => { 
        opts = meta
    })

    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                middlewares:  [AclMiddleware({ service: "acl" })],
                logger: console,
                logLevel: "info" //"debug"
            });
            broker.createService(ACL);
            broker.createService(Keys);
            await broker.start();
            expect(broker).toBeDefined();
        });

    });

    describe("Test parser", () => {

        it("it should initialize the parser", async () => {
            parser = new Parser({broker});
            expect(parser instanceof Parser).toEqual(true);
        });

        it("it should parse the process", async () => {
            let id = uuid();
            let objectName = "Process Example";
            let ownerId = credentials.ownerId;
            parsedData = parser.parse({id, xmlData, objectName, ownerId});
            expect(parsedData).toBeDefined();
            expect(parsedData.process.id).toEqual(id);
            expect(parsedData.process.name).toEqual(objectName);
            // console.log(util.inspect(parsedData, { showHidden: false, depth: null, colors: true }));
        });
    });

    describe("Test database connector", () => {

        it("it should initialize the connector and connect to database", async () => {
            db = new DB({broker, options: settings.db, services: settings.services});
            await db.connect();
            expect(db instanceof DB).toEqual(true);
        });

        it("it should deploy a process", () => {
            let params = {
                opts,
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

        it("it should retrieve the process again", () => {
            let params = {
                opts,
                processId: parsedData.process.id,
                versionId: parsedData.version.id
            };
            return db.getProcess(params).then(res => {
                expect(res).toBeDefined();
                expect(res.parsedData).toEqual(parsedData);
            });
            
        });

        it("it should retrieve the xml of the process", () => {
            let params = {
                opts,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                xml: true
            };
            return db.getProcess(params).then(res => {
                expect(res).toBeDefined();
                expect(res.xmlData).toEqual(xmlData.toString());
            });
            
        });

        it("it should retrieve a version list", () => {
            let params = {
                opts
            };
            return db.getVersionList(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].parsed).toEqual(parsedData);
            });
            
        });

        it("it should retrieve a version list for a single process", () => {
            let params = {
                opts,
                processId: parsedData.process.id
            };
            return db.getVersionList(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].parsed).toEqual(parsedData);
            });
            
        });
        it("it should activate the version", () => {
            let params = {
                opts,
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

        it("it should retrieve list with activate versions", () => {
            let params = {
                opts
            };
            return db.getActive(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toContainEqual({
                    processId: parsedData.process.id,
                    versionId: parsedData.version.id
                });
            });
            
        });

        it("it should retrieve a process list", () => {
            let params = {
                opts
            };
            return db.getProcessList(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].name).toEqual(parsedData.process.name);
                expect(res[0].active).toEqual(true);
                // console.log(util.inspect(res, { showHidden: false, depth: null, colors: true }));
            });
            
        });

        it("it should retrieve subscriptions", () => {
            let params = {
                opts,
                eventName: parsedData.event[0].name
            };
            return db.getSubscriptions(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toContainEqual(expect.objectContaining({ elementId: parsedData.event[0].id, processId: parsedData.process.id, versionId: parsedData.version.id, ownerId: opts.acl.ownerId }));
                expect(res[0].element).toEqual(parsedData.event[0]);
            });
            
        });

        it("it should deactivate the process", () => {
            let params = {
                opts,
                processId: parsedData.process.id
            };
            return db.deactivateProcess(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    processId: parsedData.process.id
                });
            });
            
        });

        it("it should retrieve a process list with inactive versions", () => {
            let params = {
                opts
            };
            return db.getProcessList(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].name).toEqual(parsedData.process.name);
                expect(res[0].active).toEqual(false);
                // console.log(util.inspect(res, { showHidden: false, depth: null, colors: true }));
            });
            
        });

        it("it should get an element of the process", () => {
            let element = parsedData.task.find(task => task.name === "Map to result");
            let params = {
                opts,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                elementId: element.id
            };
            return db.getElement(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(element);
            });
        });

        it("it should get next sequence of the process", () => {
            let element = parsedData.task.find(task => task.name === "Map to result");
            let nextTask = parsedData.task.find(task => task.name === "Update Buiness Partner");
            let params = {
                opts,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                elementId: element.id
            };
            return db.getNext(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].fromId).toEqual(element.id);
                expect(res[0].toId).toEqual(nextTask.id);
                sequence = res[0];
            });
        });

        it("it should get next task of the process", () => {
            let task = parsedData.task.find(task => task.name === "Update Buiness Partner");
            let params = {
                opts,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                elementId: sequence.id
            };
            return db.getNext(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].id).toEqual(task.id);
            });
        });

        it("it should get previous element of the process", () => {
            let task = parsedData.task.find(task => task.name === "Map to result");
            let params = {
                opts,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                elementId: sequence.id
            };
            return db.getPrevious(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].id).toEqual(task.id);
            });
        });

        it("it should create a new instance", () => {
            let params = {
                opts,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId: uuid()
            };
            return db.createInstance(params).then(res => {
                expect(res).toBeDefined();
                expect(res.instanceId).toEqual(params.instanceId);
                instance = params.instanceId;
            });
        });

        it("it should update the instance", () => {
            let params = {
                opts,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId: instance,
                completed: true
            };
            return db.updateInstance(params).then(res => {
                expect(res).toBeDefined();
                expect(res.instanceId).toEqual(params.instanceId);
            });
        });

        it("it should create a second instance", () => {
            let params = {
                opts,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId: uuid()
            };
            return db.createInstance(params).then(res => {
                expect(res).toBeDefined();
                expect(res.instanceId).toEqual(params.instanceId);
                instance = params.instanceId;
            });
        });

        it("it should update the second instance", () => {
            let params = {
                opts,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId: instance,
                failed: true
            };
            return db.updateInstance(params).then(res => {
                expect(res).toBeDefined();
                expect(res.instanceId).toEqual(params.instanceId);
            });
        });
    
        it("it should add a context key", () => {
            let params = {
                opts,
                instanceId: instance,
                key: "my key",
                value: {
                    any: "object"
                }
            };
            return db.addContextKey(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should add a second context key", () => {
            let params = {
                opts,
                instanceId: instance,
                key: "my second key",
                value: {
                    any: "other object"
                }
            };
            return db.addContextKey(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should read a context key", () => {
            let params = {
                opts,
                instanceId: instance,
                key: "my key"
            };
            return db.getContextKey(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    any: "object"
                });
            });
        });

        it("it should read the whole context", () => {
            let params = {
                opts,
                instanceId: instance
            };
            return db.getContext(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    "my key": {
                        any: "object"
                    },
                    "my second key": {
                        any: "other object"
                    }
                });
            });
        });

        it("it should read two keys from context", () => {
            let params = {
                opts,
                instanceId: instance,
                keys: ["my key","my second key"]
            };
            return db.getContextKeys(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    "my key": {
                        any: "object"
                    },
                    "my second key": {
                        any: "other object"
                    }
                });
            });
        });

        it("it should add a null value to context (as an empty object)", () => {
            let params = {
                opts,
                instanceId: instance,
                key: "my null key",
                value: null
            };
            return db.addContextKey(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should read a null value from context as an empty object", () => {
            let params = {
                opts,
                instanceId: instance,
                key: "my null key"
            };
            return db.getContextKey(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({});
            });
        });

        it("it should add a context object", () => {
            let params = {
                opts,
                instanceId: instance,
                context: {
                    "another one": {
                        any: "12345"
                    },
                    "one more": {
                        any: "54321"
                    }
                }
            };
            return db.updateContext(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should read two keys from context", () => {
            let params = {
                opts,
                instanceId: instance,
                keys: ["another one","one more"]
            };
            return db.getContextKeys(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    "another one": {
                        any: "12345"
                    },
                    "one more": {
                        any: "54321"
                    }
                });
            });
        });

        it("it should emit a token", () => {
            let params = {
                opts,
                instanceId: instance,
                emit: [{ token: "t1", instanceId: instance }]
            };
            return db.logToken(params).then(res => {
                expect(res).toBeDefined();
                // console.log(util.inspect(res, { showHidden: false, depth: null, colors: true }));
                expect(res.emitted).toEqual(params.emit);
            });
        });

        it("it should return 1 active token", () => {
            let params = {
                opts,
                instanceId: instance
            };
            return db.getToken(params).then(res => {
                expect(res).toBeDefined();
                // console.log(util.inspect(res, { showHidden: false, depth: null, colors: true }));
                expect(res.active).toContainEqual({ token: "t1", instanceId: instance });
            });
        });

        it("it should emit a second token", () => {
            let params = {
                opts,
                instanceId: instance,
                emit: [{ token: "t2", instanceId: instance }]
            };
            return db.logToken(params).then(res => {
                expect(res).toBeDefined();
                // console.log(util.inspect(res, { showHidden: false, depth: null, colors: true }));
                expect(res.emitted).toEqual(params.emit);
            });
        });

        it("it should return 2 active token", () => {
            let params = {
                opts,
                instanceId: instance
            };
            return db.getToken(params).then(res => {
                expect(res).toBeDefined();
                // console.log(util.inspect(res, { showHidden: false, depth: null, colors: true }));
                expect(res.active).toContainEqual({ token: "t1", instanceId: instance });
                expect(res.active).toContainEqual({ token: "t2", instanceId: instance });
            });
        });

        it("it should consume the first token and emit a third token", () => {
            let params = {
                opts,
                instanceId: instance,
                consume: [{ token: "t1", instanceId: instance }],
                emit: [{ token: "t3", instanceId: instance }]
            };
            return db.logToken(params).then(res => {
                expect(res).toBeDefined();
                // console.log(util.inspect(res, { showHidden: false, depth: null, colors: true }));
                expect(res.emitted).toEqual(params.emit);
                expect(res.consumed).toEqual(params.consume);
            });
        });

        it("it should return 2 active and 1 history token", () => {
            let params = {
                opts,
                instanceId: instance,
                history: true
            };
            return db.getToken(params).then(res => {
                expect(res).toBeDefined();
                // console.log(util.inspect(res, { showHidden: false, depth: null, colors: true }));
                expect(res.active).toContainEqual({ token: "t2", instanceId: instance });
                expect(res.active).toContainEqual({ token: "t3", instanceId: instance });
                expect(res.history).toContainEqual(expect.objectContaining({ token: { token: "t1", instanceId: instance }}));
            });
        });

        it("it should consume the last two active token ", () => {
            let params = {
                opts,
                instanceId: instance,
                consume: [{ token: "t2", instanceId: instance },
                { token: "t3", instanceId: instance }]
            };
            return db.logToken(params).then(res => {
                expect(res).toBeDefined();
                // console.log(util.inspect(res, { showHidden: false, depth: null, colors: true }));
                expect(res.consumed).toEqual(params.consume);
            });
        });

        it("it should return 0 active and 3 history token", () => {
            let params = {
                opts,
                instanceId: instance,
                history: true
            };
            return db.getToken(params).then(res => {
                expect(res).toBeDefined();
                // console.log(util.inspect(res, { showHidden: false, depth: null, colors: true }));
                expect(res.active.length).toEqual(0);
                expect(res.history).toEqual(expect.arrayContaining([
                    expect.objectContaining({ token: { token: "t1", instanceId: instance }}),
                    expect.objectContaining({ token: { token: "t2", instanceId: instance }}),
                    expect.objectContaining({ token: { token: "t3", instanceId: instance }})
                ]));
            });
        });

        it("it should add a scheduled token", () => {
            let params = {
                time,
                token: {
                    instanceId: instance
                }
            };
            return db.scheduleToken(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should add a second scheduled token for the same time", () => {
            let params = {
                time,
                token: {
                    instanceId: instance
                }
            };
            return db.scheduleToken(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should fetch all scheduled token", () => {
            function callback ({ id, time, payload }) {
                console.log(id, time, payload)
            }
            let params = {
                time,
                runner: uuid(),
                callback
            };
            return db.fetchScheduledToken(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should calculate the next timeblock", async () => {
            const next = await db.calculateNextTimeBlock({ time });
            expect(next).toBeDefined();
            expect(next.getMinutes()).toEqual(time.getMinutes() +  1);
        });

        it("it should return the processed timeblock", () => {
            let params = {
                time
            };
            return db.getScheduleStatus(params).then(res => {
                expect(res).toBeDefined();
                // console.log(util.inspect(res, { showHidden: false, depth: null, colors: true }));
                expect(res).toContainEqual(expect.objectContaining({
                    timeblock: db.calculateTimeBlock({ time }),
                    runner: expect.any(String),
                    fetched: expect.any(Object),
                    confirmed: expect.any(Object)
                }));
            });
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