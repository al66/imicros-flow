"use strict";

const { ServiceBroker } = require("moleculer");
const { Listener } = require("../index");
const { Emitter } = require("../index");
const { Controller } = require("../index");
const { Query } = require("../index");

const timestamp = Date.now();

const options = {
    settings: { 
        db: {
            uri: process.env.URI || "bolt://localhost:7687",
            user: "neo4j",
            password: "neo4j"
        }
    }
};

beforeAll( async () => {
});

afterAll( async () => {
});

describe("Test flow.listener", () => {

    let broker, emitter, listener, control, query;
    beforeAll(() => {
        broker = new ServiceBroker({
            logger: console,
            logLevel: "debug" //"debug"
        });
        emitter = broker.createService(Emitter, Object.assign(options));
        listener = broker.createService(Listener, Object.assign(options));
        control = broker.createService(Controller, Object.assign(options));
        query = broker.createService(Query, Object.assign(options));
        return broker.start();
    });
    
    afterAll(async () => {
        // wait some time for consuming
        /*
        await new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, 100);
        });
        */
        await broker.stop();
    });
    
    describe("Test create service", () => {

        it("services should be created", () => {
            expect(emitter).toBeDefined();
            expect(listener).toBeDefined();
            expect(control).toBeDefined();
            expect(query).toBeDefined();
        });
        
    });

    describe("Test emitter", () => {

        let opts;
        beforeEach(() => {
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` } } };
        });
        
        it("it should emit an event", async () => {
            let params = {
                eventName: "my.event",
                payload: {
                    this: {
                        is: {
                            the: {
                                final: "result"
                            }
                        }
                    }
                },
                meta: {
                    owner: {
                        type: "group",
                        id: `group1-${timestamp}`
                    },
                    flow: {
                        process: "my.process",
                        step: "first.step",
                        contextId: `context1-${timestamp}`
                    }
                }
            };
            return broker.call("flow.emitter.emit", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });
        
    });
    
    /*
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
                    },
                    onDone: {
                        name: "on done"
                    },
                    onError: {
                        name: "on error"
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
                    call: {
                        service: "call-service",
                        action: "call-action",
                        owner: {
                            type: "group",
                            id: `group1-${timestamp}`
                        },
                        map: { 
                            attrib1: "context.firststep.result",
                            attrib2: "context.secondstep.result"
                        },
                        meta: {
                            flow: {
                                process: "my-process",
                                step: "my-process-step",
                                onDone: {
                                    event: "on done"
                                },
                                onError: {
                                    event: "on error"
                                }
                            }
                        }
                    }
                }));
                expect(res).toContainEqual(expect.objectContaining({
                    call: {
                        service: "call-service",
                        action: "call-action",
                        owner: {
                            type: "group",
                            id: `group2-${timestamp}`
                        },
                        map: { 
                            attrib1: "context.firststep.result",
                            attrib2: "context.secondstep.result"
                        },
                        meta: {
                            flow: {
                                process: "my-process-2",
                                step: "my-process-step-2",
                                onDone: {
                                    event: "END"
                                },
                                onError: {
                                    event: "END"
                                }
                            }
                        }
                    }
                }));
            });
        });

    });
    */
    
});