"use strict";

const { ServiceBroker } = require("moleculer");
const { Controller } = require("../index");
const { Query } = require("../index");

const timestamp = Date.now();

beforeAll( async () => {
});

afterAll( async () => {
});

describe("Test db.neo4j", () => {

    let broker, control, query;
    beforeAll(() => {
        broker = new ServiceBroker({
            logger: console,
            logLevel: "info" //"debug"
        });
        control = broker.createService(Controller, Object.assign({
            settings: { 
                uri: process.env.URI || "bolt://localhost:7687",
                user: "neo4j",
                password: "neo4j"
            }
        }));
        query = broker.createService(Query, Object.assign({
            settings: { 
                uri: process.env.URI || "bolt://localhost:7687",
                user: "neo4j",
                password: "neo4j"
            }
        }));
        return broker.start();
    });
    
    afterAll(async () => {
        await broker.stop();
    });
    
    describe("Test create service", () => {

        it("it should be created", () => {
            expect(control).toBeDefined();
            expect(query).toBeDefined();
        });
        
    });

    describe("Test add next", () => {

        let opts;
        beforeEach(() => {
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` } } };
        });
        
        it("it should return created event, task and relation", () => {
            let params = {
                listen: { 
                    name: "my-event",
                    owner: {
                        type: "group",
                        id: `group1-${timestamp}`
                    },
                    process: "my-process-to-listen",
                    step: "my-process-step-to-listen"
                },
                task: { 
                    process: "my-process",
                    step: "my-process-step",
                    owner: {
                        type: "group",
                        id: `group1-${timestamp}`
                    },
                    service: "call-service",
                    action: "call-action",
                    map: { 
                        attrib1: "context.firststep.result",
                        attrib2: "context.secondstep.result"
                    }
                }
            };
            return broker.call("flow.control.addNext", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toContainEqual(expect.objectContaining({
                    event: { 
                        name: params.listen.name,
                        ownerType: "group",
                        ownerId: params.listen.owner.id
                    },
                    task: {
                        process: params.task.process,
                        step: params.task.step,
                        service: params.task.service,
                        action: params.task.action,
                        map: { 
                            attrib1: "context.firststep.result",
                            attrib2: "context.secondstep.result"
                        },
                        ownerType: "group",
                        ownerId: `group1-${timestamp}`
                    },
                    listen: {
                        process: params.listen.process,
                        step: params.listen.step
                    }
                }));
            });
        });

        it("it should return second task and relation", () => {
            let params = {
                listen: { 
                    name: "my-event",
                    owner: {
                        type: "group",
                        id: `group1-${timestamp}`
                    },
                    process: "my-process-to-listen",
                    step: "my-process-step-to-listen"
                },
                task: { 
                    process: "my-process-2",
                    step: "my-process-step-2",
                    owner: {
                        type: "group",
                        id: `group2-${timestamp}`
                    },
                    service: "call-service",
                    action: "call-action",
                    map: { 
                        attrib1: "context.firststep.result",
                        attrib2: "context.secondstep.result"
                    }
                }
            };
            return broker.call("flow.control.addNext", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toContainEqual(expect.objectContaining({
                    event: { 
                        name: params.listen.name,
                        ownerType: "group",
                        ownerId: params.listen.owner.id
                    },
                    task: {
                        process: params.task.process,
                        step: params.task.step,
                        ownerType: "group",
                        ownerId: `group2-${timestamp}`,
                        service: params.task.service,
                        action: params.task.action,
                        map: { 
                            attrib1: "context.firststep.result",
                            attrib2: "context.secondstep.result"
                        }
                    },
                    listen: {
                        process: params.listen.process,
                        step: params.listen.step
                    }
                }));
            });
        });      
        
        it("it should update existing relations", () => {
            let params = {
                listen: { 
                    name: "my-event",
                    owner: {
                        type: "group",
                        id: `group1-${timestamp}`
                    },
                    process: "my-process-to-listen",
                    step: "my-process-step-to-listen"
                },
                task: { 
                    process: "my-process",
                    step: "my-process-step",
                    owner: {
                        type: "group",
                        id: `group1-${timestamp}`
                    },
                    service: "call-service",
                    action: "call-action",
                    map: { 
                        attrib1: "context.firststep.result",
                        attrib2: "context.secondstep.result"
                    }
                },
                done: {
                    name: "on done"
                },
                error: {
                    name: "on error"
                }
            };
            return broker.call("flow.control.addNext", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toContainEqual(expect.objectContaining({
                    event: { 
                        name: params.listen.name,
                        ownerType: "group",
                        ownerId: params.listen.owner.id
                    },
                    task: {
                        process: params.task.process,
                        step: params.task.step,
                        service: params.task.service,
                        action: params.task.action,
                        map: { 
                            attrib1: "context.firststep.result",
                            attrib2: "context.secondstep.result"
                        },
                        ownerType: "group",
                        ownerId: params.task.owner.id
                    },
                    listen: {
                        process: params.listen.process,
                        step: params.listen.step
                    }
                }));
            });
        });

        it("it should return tasks", () => {
            let params = {
                event: { 
                    name: "my-event",
                    owner: {
                        type: "group",
                        id: `group1-${timestamp}`
                    },
                    process: "my-process-to-listen",
                    step: "my-process-step-to-listen"
                }
            };
            return broker.call("flow.query.next", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).not.toEqual([]);
                expect(res).toContainEqual(expect.objectContaining({
                    task: {
                        process: "my-process",
                        step: "my-process-step",
                        ownerType: "group",
                        ownerId: `group1-${timestamp}`,
                        service: "call-service",
                        action: "call-action",
                        map: { 
                            attrib1: "context.firststep.result",
                            attrib2: "context.secondstep.result"
                        }
                    },
                    onDone: {
                        event: "on done"
                    },
                    onError: {
                        event: "on error"
                    }
                }));
                expect(res).toContainEqual(expect.objectContaining({
                    task: {
                        process: "my-process-2",
                        step: "my-process-step-2",
                        service: "call-service",
                        action: "call-action",
                        map: { 
                            attrib1: "context.firststep.result",
                            attrib2: "context.secondstep.result"
                        },
                        ownerType: "group",
                        ownerId: `group2-${timestamp}`
                    }
                }));
            });
        });

    });
    
});