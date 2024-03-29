"use strict";

const { ServiceBroker } = require("moleculer");
const { Constants } = require("imicros-flow-control");
const { AclMiddleware } = require("imicros-acl");
const { Activity } = require("../index");
const { Next } = require("../index");
const { v4: uuid } = require("uuid");

// helper & mocks
const { Collect, clear, LogActions } = require("./helper/collect");
const { Query, process } = require("./helper/query");
const { Context, context } = require("./helper/context");
const { ACL, user } = require("./helper/acl");
const { Test, call } = require("./helper/action");
const { Rules, rule } = require("./helper/rules");
const { Agents } = require("./helper/agents");
const { Queue } = require("./helper/queue");
const { credentials } = require("./helper/credentials");

const calls = [];
const actions = [];
const CollectEvents = Object.assign(Collect,{ settings: { calls: calls }});
const ownerId = credentials.ownerId;

describe("Test activity service", () => {

    const [master] = ["master"].map(nodeID => {
        return new ServiceBroker({
            namespace: "token",
            nodeID: nodeID,
            middlewares: [LogActions({ actions }, AclMiddleware({ service: "acl" }))],
            // transporter: "nats://192.168.2.124:4222",
            // logLevel: "info" //"debug"
            logLevel: "debug"
            // logger: false 
        });        
    });    
    
    // Load services
    [CollectEvents, Activity, Next, Context, Query, ACL, Test, Rules, Agents, Queue].map(service => { return master.createService(service); }); 

    // Start & Stop
    beforeAll(() => Promise.all([master.start()]));
    afterAll(async () => await Promise.all([master.stop()]));

    beforeEach(() => { clear(calls); actions.splice(0, actions.length); });
  
    it("it should execute service task",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.SERVICE_TASK,
            status: Constants.ACTIVITY_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        process.current = {
            processId: token.processId,
            versionId: token.versionId,
            elementId: token.elementId,
            type: token.type,
            attributes: {
                action: "test.actionA",
                paramsKey: "myKey",
                resultKey: "actionA"
            }
        };        
        call.result = {
            test: "my result"  
        };
        context[token.instanceId] = [];
        context[token.instanceId][process.current.attributes.paramsKey] = {  a: "test" };
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                // console.log(actions);
                // console.log(calls);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                
                // 2 times call to getTask: action prepare & action execute
                let getTask = actions.filter(a => a.action.name === "flow.query.getTask");
                expect(getTask).toHaveLength(2);
                // expect both times correct meta data
                expect(getTask[0].meta).toMatchObject({
                    service: {
                        serviceToken: credentials.serviceToken
                    },
                    ownerId: ownerId,
                    user: user,
                    acl: {
                        accessToken: credentials.accessToken
                    }
                });
                expect(getTask[1].meta).toMatchObject({
                    service: {
                        serviceToken: credentials.serviceToken
                    },
                    ownerId: ownerId,
                    user: user,
                    acl: {
                        accessToken: credentials.accessToken
                    }
                });

                // 2 times call to requestAccess: action prepare & action execute
                let requestAccess = actions.filter(a => a.action.name === "agents.requestAccess");
                expect(requestAccess[0]).toMatchObject({
                    params: {
                        ownerId
                    },
                    meta: {
                        service: {
                            serviceToken: credentials.serviceToken
                        },
                        user: user
                    }
                });
                expect(requestAccess[1]).toMatchObject({
                    params: {
                        ownerId
                    },
                    meta: {
                        service: {
                            serviceToken: credentials.serviceToken
                        },
                        user: user
                    }
                });
                
            
                expect(calls["flow.token.consume"].filter(o => o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                
                //expect(calls["flow.activity.activated"]).toHaveLength(1);
                // expect(calls["flow.activity.activated"].filter(o => o.payload.token == token)).toHaveLength(1);
                // calls["flow.token.emit"].map(o => console.log(o.payload));
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.ACTIVITY_COMPLETED)).toHaveLength(1);
                expect(context[token.instanceId][process.current.attributes.resultKey]).toEqual(call.result);
            }); 
    });

    it("it should evaluate ruleset and emit activity completed token", () => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.BUSINESS_RULE_TASK,
            status: Constants.ACTIVITY_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        process.current = {
            processId: token.processId,
            versionId: token.versionId,
            elementId: token.elementId,
            type: token.type,
            attributes: {
                contextKeys: [],
                ruleset: "myRule",
                contextKey: "myRule"
            }
        };
        rule.result = {
            a: "test"
        };
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                // console.log(calls);
                // expect(calls["flow.activity.activated"]).toHaveLength(2);
                // expect(calls["flow.activity.activated"].filter(o => o.payload.token == token)).toHaveLength(1);
                // calls["flow.token.emit"].map(o => console.log(o.payload));
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.ACTIVITY_COMPLETED)).toHaveLength(1);
                expect(context[token.instanceId][process.current.attributes.contextKey]).toEqual(rule.result);
            }); 
    });

    it("it should map parameter and execute service task",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.SERVICE_TASK,
            status: Constants.ACTIVITY_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        let template = Buffer.from(JSON.stringify({ a: "{{inKey}}"})).toString("base64");
        process.current = {
            processId: token.processId,
            versionId: token.versionId,
            elementId: token.elementId,
            type: token.type,
            attributes: {
                action: "test.actionA",
                contextKeys: ["inKey"],
                prepFunction: "template",
                template,
                paramsKey: "myKey",
                resultKey: "actionA"
            }
        };        
        call.result = {
            test: "my result"  
        };
        context[token.instanceId] = [];
        context[token.instanceId]["inKey"] = "test";
        // context[token.instanceId][process.current.attributes.paramsKey] = {  a: "test" };
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                // console.log(actions);
                // console.log(calls);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                
                // 2 times call to getTask: action prepare & action execute
                let getTask = actions.filter(a => a.action.name === "flow.query.getTask");
                expect(getTask).toHaveLength(2);
                // expect both times correct meta data
                expect(getTask[0].meta).toMatchObject({
                    service: {
                        serviceToken: credentials.serviceToken
                    },
                    ownerId: ownerId,
                    user: user,
                    acl: {
                        accessToken: credentials.accessToken
                    }
                });
                expect(getTask[1].meta).toMatchObject({
                    service: {
                        serviceToken: credentials.serviceToken
                    },
                    ownerId: ownerId,
                    user: user,
                    acl: {
                        accessToken: credentials.accessToken
                    }
                });

                // 2 times call to requestAccess: action prepare & action execute
                let requestAccess = actions.filter(a => a.action.name === "agents.requestAccess");
                expect(requestAccess[0]).toMatchObject({
                    params: {
                        ownerId
                    },
                    meta: {
                        service: {
                            serviceToken: credentials.serviceToken
                        },
                        user: user
                    }
                });
                expect(requestAccess[1]).toMatchObject({
                    params: {
                        ownerId
                    },
                    meta: {
                        service: {
                            serviceToken: credentials.serviceToken
                        },
                        user: user
                    }
                });
                
            
                expect(calls["flow.token.consume"].filter(o => o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                
                //expect(calls["flow.activity.activated"]).toHaveLength(1);
                // expect(calls["flow.activity.activated"].filter(o => o.payload.token == token)).toHaveLength(1);
                // calls["flow.token.emit"].map(o => console.log(o.payload));
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.ACTIVITY_COMPLETED)).toHaveLength(1);
                expect(context[token.instanceId][process.current.attributes.resultKey]).toEqual(call.result);
            }); 
    });

    it("it should map parameter and queue service agent task",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.SERVICE_TASK,
            status: Constants.ACTIVITY_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        let template = Buffer.from(JSON.stringify({ a: "{{inKey}}"})).toString("base64");
        process.current = {
            processId: token.processId,
            versionId: token.versionId,
            elementId: token.elementId,
            type: token.type,
            attributes: {
                serviceId: uuid(),
                contextKeys: ["inKey"],
                prepFunction: "template",
                template,
                paramsKey: "myKey",
                resultKey: "serviceA"
            }
        };        
        call.result = {
            test: "my result"  
        };
        context[token.instanceId] = [];
        context[token.instanceId]["inKey"] = "test";
        // context[token.instanceId][process.current.attributes.paramsKey] = {  a: "test" };
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                // console.log(actions);
                // console.log(calls);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                
                // 2 times call to getTask: action prepare & action execute
                let getTask = actions.filter(a => a.action.name === "flow.query.getTask");
                expect(getTask).toHaveLength(2);
                // expect both times correct meta data
                expect(getTask[0].meta).toMatchObject({
                    service: {
                        serviceToken: credentials.serviceToken
                    },
                    ownerId: ownerId,
                    user: user,
                    acl: {
                        accessToken: credentials.accessToken
                    }
                });
                expect(getTask[1].meta).toMatchObject({
                    service: {
                        serviceToken: credentials.serviceToken
                    },
                    ownerId: ownerId,
                    user: user,
                    acl: {
                        accessToken: credentials.accessToken
                    }
                });

                // 2 times call to requestAccess: action prepare & action execute
                let requestAccess = actions.filter(a => a.action.name === "agents.requestAccess");
                expect(requestAccess[0]).toMatchObject({
                    params: {
                        ownerId
                    },
                    meta: {
                        service: {
                            serviceToken: credentials.serviceToken
                        },
                        user: user
                    }
                });
                expect(requestAccess[1]).toMatchObject({
                    params: {
                        ownerId
                    },
                    meta: {
                        service: {
                            serviceToken: credentials.serviceToken
                        },
                        user: user
                    }
                });
                
                // 2 times call to getTask: action prepare & action execute
                let queueCalls = actions.filter(a => a.action.name === "queue.add");
                expect(queueCalls).toHaveLength(1);
                
                //expect(calls["flow.activity.activated"]).toHaveLength(1);
                // expect(calls["flow.activity.activated"].filter(o => o.payload.token == token)).toHaveLength(1);
                // calls["flow.token.emit"].map(o => console.log(o.payload));
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.ACTIVITY_COMPLETED)).toHaveLength(0);
                // expect(context[token.instanceId][process.current.attributes.resultKey]).toEqual(call.result);
            }); 
    });
 
    it("it should complete service agent task",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.SERVICE_TASK,
            status: Constants.ACTIVITY_READY,
            user: user,
            ownerId: ownerId
        };
        let template = Buffer.from(JSON.stringify({ a: "{{inKey}}"})).toString("base64");
        process.current = {
            processId: token.processId,
            versionId: token.versionId,
            elementId: token.elementId,
            type: token.type,
            attributes: {
                serviceId: uuid(),
                contextKeys: ["inKey"],
                prepFunction: "template",
                template,
                paramsKey: "myKey",
                resultKey: "serviceA"
            }
        };        
        let result = {
            test: "my result"  
        };
        context[token.instanceId] = [];
        context[token.instanceId]["inKey"] = "test";
        // context[token.instanceId][process.current.attributes.paramsKey] = {  a: "test" };
        return master.call("flow.activity.completed", { token, result })
            .delay(10)
            .then(() => {
                // console.log(actions);
                // console.log(calls);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.ACTIVITY_COMPLETED)).toHaveLength(1);
                
                // 1 time call to getTask: handle completed
                let getTask = actions.filter(a => a.action.name === "flow.query.getTask");
                expect(getTask).toHaveLength(1);
                // expect both times correct meta data
                expect(getTask[0].meta).toMatchObject({
                    service: {
                        serviceToken: credentials.serviceToken
                    },
                    ownerId: ownerId,
                    user: user,
                    acl: {
                        accessToken: credentials.accessToken
                    }
                });
                let contextCalls = actions.filter(a => a.action.name === "flow.context.add");
                expect(contextCalls).toHaveLength(1);
                
                expect(calls["flow.token.consume"].filter(o => o.payload.token.status == Constants.ACTIVITY_READY)).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.ACTIVITY_COMPLETED)).toHaveLength(1);
            }); 
    });
 
});