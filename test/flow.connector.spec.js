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
    await broker.stop();
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

        it("it should create a worklist node", async () => {
            let statement = "MERGE (w:Worklist { name: {worklist} })";
            let res = await connector.run(statement, { worklist: "open.events" });
            expect(res).toBeDefined();
            expect(res).toEqual([]);
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
        
        let processes = [], tasks = [], gateways = [], subscriptions = [];
        
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
   
        it("it should add a subscription", async () => {
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
            let res = await connector.addSubscription(event);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                id: expect.any(String)
            }));
            subscriptions["S1"] = res[0].id;
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
   
        it("it should add sequence flow from subscription to gateway", async () => {
            let connection = {
                fromId: subscriptions["S1"],
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
                    from: subscriptions["S1"],
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
    
    describe("Test lifecycle", () => {
    
        let events = [];

        it("it should return created event, task and relation", async () => {
            let listen = { 
                name: "my.event",
                owner: {
                    type: "group",
                    id: `group1-${timestamp}`
                },
                process: null,
                step: null
            };
            let task = { 
                process: "my-process",
                step: "my-process-step",
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
            let res = await connector.addNext(listen, task);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                event: { 
                    name: listen.name,
                    ownerType: "group",
                    ownerId: listen.owner.id
                },
                task: {
                    process: task.process,
                    step: task.step,
                    service: task.service,
                    action: task.action,
                    map: task.map,
                    ownerType: "group",
                    ownerId: task.owner.id
                },
                listen: {
                    process: "*",
                    step: "*"
                }
            }));
        });

        it("it should return next call", async () => {
            let event = { 
                name: "my.event",
                owner: {
                    type: "group",
                    id: `group1-${timestamp}`
                },
                process: null,
                step: null
            };
            let res = await connector.nextActions(event);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                call: {
                    service: "test",
                    action: "action",
                    map: { 
                        attrib1: "context.firststep.result",
                        attrib2: "context.secondstep.result"
                    },
                    meta: {
                        flow: {
                            process: "my-process",
                            step: "my-process-step",
                            onDone: {
                                event: "call-service.call-action.done"
                            },
                            onError: {
                                event: "call-service.call-action.error"
                            }
                        }
                    },
                    owner: {
                        type: "group",
                        id: event.owner.id
                    }
                }
            }));
        });

        it("it should emit an event", async () => {
            let eventName = "my.event";
            let payload = {
                this: {
                    is: {
                        the: {
                            final: "result"
                        }
                    }
                }
            };
            let meta = {
                owner: {
                    type: "group",
                    id: `group1-${timestamp}`
                },
                flow: {
                    process: "my.process",
                    step: "first.step",
                    contextId: `context1-${timestamp}`
                }
            };
            let res = await connector.emit(eventName, payload, meta);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                event: {
                    id: expect.any(String),
                    name: eventName,
                    timestamp: expect.any(Number),
                    owner:  {
                        id: meta.owner.id,
                        type: meta.owner.type
                    }
                }
            }));
            events.push(res[0].event);
        });

        it("it should emit a second event with the same context", async () => {
            let eventName = "my.event";
            let payload = {
                this: {
                    is: {
                        the: {
                            second: "result"
                        }
                    }
                }
            };
            let meta = {
                owner: {
                    type: "group",
                    id: `group1-${timestamp}`
                },
                flow: {
                    process: "my.process",
                    step: "second.step",
                    contextId: `context1-${timestamp}`
                }
            };
            let res = await connector.emit(eventName, payload, meta);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                event: {
                    id: expect.any(String),
                    name: eventName,
                    timestamp: expect.any(Number),
                    owner:  {
                        id: meta.owner.id,
                        type: meta.owner.type
                    }
                }
            }));
            events.push(res[0].event);
        });

        it("it should fetch some events", async () => {
            await connector.assignEvents(50);
            let res = await connector.fetchEvents(50);
            expect(res).toBeDefined();
            expect(res).toContainEqual(expect.objectContaining({
                event: {
                    uid: expect.any(String),
                    name: "my.event",
                    contextId: expect.any(String),
                    owner: {
                        id: `group1-${timestamp}`,
                        type: "group"
                    }
                }
            }));

        });

        it("it should retrieve the whole context", async () => {
            let res = await connector.context(`context1-${timestamp}`);
            expect(res).toBeDefined();
            expect(res.my.process.first.step.my.event.this.is.the.final).toEqual("result");
        });

        it("it should create a batch of actions", async () => {
            let actions = [];
            let call = {
                uid: `action1-${timestamp}`,
                service: "test",
                action: "action",
                eventId: events[0].id,
                params: JSON.stringify({ 
                    attrib1: 1,
                    attrib2: "any"
                }),
                meta: JSON.stringify({
                    flow: {
                        trigger: {
                            type: "event",
                            name: events[0].name,
                            id: events[0].id
                        },
                        process: "my-process",
                        step: "my-process-step",
                        onDone: {
                            event: "call-service.call-action.done"
                        },
                        onError: {
                            event: "call-service.call-action.error"
                        }
                    }
                }),
                ownerType: "group",
                ownerId: `group3-${timestamp}`
            };
            actions.push(call);
            let res = await connector.createActions(actions);
            expect(res).toBeDefined();
            expect(res[0].created).toEqual(1);
        });

        it("it should schedule actions", async () => {
            let listen = { name: "my.test", owner: { type: "group", id: `group1-${timestamp}` }, process: null, step: null };
            let task = { 
                process: "my-process",
                step: "my-process-step",
                owner: { type: "group", id: `group1-${timestamp}` },
                service: "test",
                action: "action",
                map: { a: "my.process.my.step.1.my.test.i" },
                onDone: { name: "call-service.call-action.done" },
                onError: { name: "call-service.call-action.error" }
            };
            await connector.addNext(listen, task);
            task = { 
                process: "my-process",
                step: "my-process-step-2",
                owner: { type: "group", id: `group1-${timestamp}` },
                service: "test",
                action: "action",
                map: { a: "my.process.my.step.my.test.i" },
                onDone: { name: "call-service.call-action.done" },
                onError: { name: "call-service.call-action.error" }
            };
            await connector.addNext(listen, task);
            let meta = { owner: { type: "group", id: `group1-${timestamp}` }, flow: { contextId: `context2-${timestamp}` } };
            for (let i=0; i< 2; i++) {
                meta.flow.process = "my.process";
                meta.flow.step = "my.step";
                meta.flow.cycle = i;
                await connector.emit("my.test", { i: i }, meta);
            }
            let res = await connector.consume();
            expect(res).toBeDefined();
            expect(res).toEqual(true);
        });

        it("it should assign actions to worker", async () => {
            await connector.startService({name: "test", actions: { action: () => {} }});
            let res = await connector.assignActions(5);
            expect(res).toBeDefined();
        });

        it("it should fetch actions of worker", async () => {
            await connector.startService({name: "test", actions: { action: () => {} }});
            let res = await connector.fetchActions(10);
            expect(res).toBeDefined();
            expect(res.length >= 4).toEqual(true);
            connector.logger.debug(`${res.length} actions fetched`, { actions: res, worker: connector.worker.uid, filter: Array.from(connector.actions) });
        });

        it("it should disconnect from database", async () => {
            connector.disconnect();
            expect(connector instanceof Connector).toEqual(true);
        });
    
    });
    
});
    