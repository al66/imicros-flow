"use strict";

const Connector = require("../lib/connector/neo4j");
const { ServiceBroker } = require("moleculer");
//const { Serializer } = require("../index");
const Constants = require("../lib/util/constants");

const timestamp = Date.now();
//const serializer = new Serializer();
//const util = require("util");

let broker, connector;
beforeAll(() => {
    broker = new ServiceBroker({
        logger: console,
        logLevel: "debug", //"debug"
    });
    return broker.start()
        .then(() => {
            //
        });
});

afterAll(async () => {
});

describe("Test connector", () => {
    
    describe("Test connect", () => {
        
        it("it should initialize the connector and connect to database", async () => {
            let options = {
                uri: process.env.URI,
                user: "neo4j",
                password: "neo4j"
            };
            connector = new Connector(broker, options);
            connector.connect();
            expect(connector instanceof Connector).toEqual(true);
        });

        it("it should create constraints", async () => {
            let res = await connector.createConstraints();
            expect(res).toBeDefined();
            expect(res).toEqual(true);
        });

        it("it should run a simple statement", async () => {
            let params = {
                name: "flow.connector"
            };
            let statement = "MERGE (s:Service { name: {name}}) RETURN s.name AS name";
            let res = await connector.run(statement, params);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                name: params.name
            }));
        });

        it("it should run multiple simple statement", async () => {
            for (let i=1; i <= 5; i++) {
                let params = {
                    name: "flow.connector_" + i
                };
                let statement = "MERGE (s:Service { name: {name}}) RETURN s.name AS name";
                let res = await connector.run(statement, params);
                expect(res).toBeDefined();
                expect(res).toContainEqual(expect.objectContaining({
                    name: params.name
                }));
            }
        });

        it("it should run batches", async () => {
            let params = {
                batches: []
            };
            for (let i=1; i <= 100; i++) {
                params.batches.push({
                    name: "flow.connector_batch_" + i
                });
            }
            let statement = "UNWIND {batches} as batch MERGE (s:Service { name: batch.name})";
            let res = await connector.run(statement, params);
            expect(res).toBeDefined();
            expect(res).toEqual([]);
        });
   
    });
    
    describe("Test control", () => {
        
        let processes = [], tasks = [], gateways = [], events = [];
        
        it("it should add a process", async () => {
            let process = { 
                name: "my first process",
                owner: {
                    type: "group",
                    id: `group1-${timestamp}`
                }
            };
            let res = await connector.addProcess(process);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                id: expect.any(String)
            }));
            processes["P1"] = res[0].id;
        });
   
        it("it should add an event", async () => {
            let event = {
                processId: processes["P1"],
                name: "mail.received",
                position: Constants.START_EVENT,
                type: Constants.DEFAULT_EVENT,
                direction: Constants.CATCHING_EVENT,
                owner: {
                    type: "group",
                    id: `group1-${timestamp}`
                }
            };
            let res = await connector.addEvent(event);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                id: expect.any(String)
            }));
            events["S1"] = res[0].id;
        });
   
        it("it should add a task", async () => {
            let task = {
                processId: processes["P1"],
                name: "my first task in the process",
                owner: {
                    type: "group",
                    id: `group1-${timestamp}`
                },
                service: "test",
                action: "action",
                map: { 
                    attrib1: "context.firststep.result",
                    attrib2: "context.secondstep.result"
                },
                onDone: {
                    name: "call-service.call-action.done"
                },
                onError: {
                    name: "call-service.call-action.error"
                }
            };
            let res = await connector.addTask(task);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                id: expect.any(String)
            }));
            tasks["T1"] = res[0].id;
        });
   
        it("it should add a gateway", async () => {
            let gateway = {
                processId: processes["P1"],
                type: Constants.EXCLUSIVE_GATEWAY,
                owner: {
                    type: "group",
                    id: `group1-${timestamp}`
                },
                rule: "@@ > result:=0 @ a :: > b => result := 1",
                function: (c) => { let r=0; if (c.a > c.b) r=1; return r; }  
            };
            let res = await connector.addGateway(gateway);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                id: expect.any(String)
            }));
            gateways["G1"] = res[0].id;
        });
   
        it("it should add sequence flow from event to gateway", async () => {
            let connection = {
                fromId: events["S1"],
                toId: gateways["G1"],
                owner: {
                    type: "group",
                    id: `group1-${timestamp}`
                }
            };
            let res = await connector.addSequence(connection);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                connection: {
                    from: events["S1"],
                    to: gateways["G1"],
                    type: Constants.SEQUENCE_STANDARD
                }
            }));
        });
   
        it("it should add sequence flow from gateway to task", async () => {
            let connection = {
                fromId: gateways["G1"],
                toId: tasks["T1"],
                owner: {
                    type: "group",
                    id: `group1-${timestamp}`
                }
            };
            let res = await connector.addSequence(connection);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                connection: {
                    from: gateways["G1"],
                    to: tasks["T1"],
                    type: Constants.SEQUENCE_STANDARD
                }
            }));
        });
   
    });

    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await connector.disconnect();
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });        
    
});
    