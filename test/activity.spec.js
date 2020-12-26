"use strict";

const { ServiceBroker } = require("moleculer");
const { Constants } = require("imicros-flow-control");
const { Token } = require("../index");
const { Activity } = require("../index");
const { v4: uuid } = require("uuid");

// helper & mocks
const { Collect } = require("./helper/collect");
const { Query, process } = require("./helper/query");
const { Context, context } = require("./helper/context");
const { ACL, user, ownerId, serviceToken } = require("./helper/acl");
const { Test, call } = require("./helper/action");
const { Rules, rule } = require("./helper/rules");

const calls = [];
const CollectEvents = Object.assign(Collect,{ settings: { calls: calls }});
const QueryACL = Object.assign(Query,{ settings: { ownerId: ownerId }});

describe("Test activity service", () => {

    process.env = { SERVICE_TOKEN: serviceToken };
    
    const [master] = ["master"].map(nodeID => {
        return new ServiceBroker({
            namespace: "token",
            nodeID: nodeID,
            // transporter: "nats://192.168.2.124:4222",
            logLevel: "info" //"debug"
            // logger: false 
        });        
    });    
    
    // Load services
    [CollectEvents, Token, Activity, Context, QueryACL, ACL, Test, Rules].map(service => { return master.createService(service); }); 
    // const [collect, token, activity, query] = [CollectEvents, Token, Activity, Query].map(service => { return master.createService(service); }); 

    // Start & Stop
    beforeAll(() => Promise.all([master.start()]));
    afterAll(() => Promise.all([master.stop()]));

    it("it should execute service task",() => {
        let token = {
            processId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.SERVICE_TASK,
            status: Constants.ACTIVITY_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        process.current = {
            processId: token.processId,
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
                // console.log(calls);
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
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.BUSINESS_RULE_TASK,
            status: Constants.ACTIVITY_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        process.current = {
            processId: token.processId,
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
            .delay(20)
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
    
});