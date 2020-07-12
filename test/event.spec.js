"use strict";

const { ServiceBroker } = require("moleculer");
const { Constants } = require("imicros-flow-control");
const Token = require("../lib/token");
const Event = require("../lib/event");
const { v4: uuid } = require("uuid");

// helper & mocks
const { Collect } = require("./helper/collect");
const { Query, process, subscriptions } = require("./helper/query");
const { Context, context } = require("./helper/context");
const { ACL, user, ownerId, serviceToken } = require("./helper/acl");
const { Test, call } = require("./helper/action");

const calls = [];
const CollectEvents = Object.assign(Collect,{ settings: { calls: calls }});
const QueryACL = Object.assign(Query,{ settings: { ownerId: ownerId }});

describe("Test activity service", () => {

    const [master] = ["master"].map(nodeID => {
        return new ServiceBroker({
            namespace: "token",
            nodeID: nodeID,
            // transporter: "nats://192.168.2.124:4222",
            logLevel: "info" //"debug"
            //logger: false 
        });        
    });    
    
    // Load services
    [CollectEvents, Token, Event, Context, QueryACL, ACL, Test].map(service => { return master.createService(service); }); 
    // const [collect, token, activity, query] = [CollectEvents, Token, Activity, Query].map(service => { return master.createService(service); }); 

    // Start & Stop
    beforeAll(() => Promise.all([master.start()]));
    afterAll(() => Promise.all([master.stop()]));

    
    it("it should trigger events for subscriptions",() => {
        let s1 = {
            processId: uuid(),
            elementId: uuid(),
            ownerId: ownerId,
            type: Constants.DEFAULT_EVENT
        };
        subscriptions.push(s1);
        return master.emit("user.created", { id: "any", name: "Max" }, { meta: { user, ownerId, serviceToken }})
            .delay(10)
            .then(() => {
                // console.log(calls["flow.instance.created"]);
                expect(calls["flow.instance.created"]).toHaveLength(1);
                expect(calls["flow.instance.created"].filter(o => o.payload.processId == s1.processId && o.payload.ownerId == s1.ownerId)).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.type == s1.type && o.payload.token.status == Constants.EVENT_OCCURED)).toHaveLength(1);
            }); 
    });
    
});