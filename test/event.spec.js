"use strict";

const { ServiceBroker } = require("moleculer");
const { Constants } = require("imicros-flow-control");
const { AclMiddleware } = require("imicros-acl");
const { Event } = require("../index");
const { Next } = require("../index");
const { v4: uuid } = require("uuid");

// helper & mocks
const { Collect, clear } = require("./helper/collect");
const { Query, subscriptions, process } = require("./helper/query");
const { Context } = require("./helper/context");
const { ACL, user } = require("./helper/acl");
const { Timer } = require("./helper/timer");
const { Agents } = require("./helper/agents");
const { credentials } = require("./helper/credentials");

const calls = [];
const CollectEvents = Object.assign(Collect,{ settings: { calls: calls }});
const ownerId = credentials.ownerId;

describe("Test activity service", () => {

    const [master] = ["master"].map(nodeID => {
        return new ServiceBroker({
            namespace: "token",
            nodeID: nodeID,
            middlewares: [AclMiddleware({ service: "acl" })],
            // transporter: "nats://192.168.2.124:4222",
            logLevel: "info" //"debug"
            // logger: false 
        });        
    });    
    
    // Load services
    [CollectEvents, Event, Next, Context, Query, ACL, Agents, Timer].map(service => { return master.createService(service); }); 

    // Start & Stop
    beforeAll(() => Promise.all([master.start()]));
    afterAll(() => Promise.all([master.stop()]));

    beforeEach(() => clear(calls));
    
    it("it should trigger events for subscriptions",() => {
        let s1 = {
            processId: uuid(),
            versionId: uuid(),
            elementId: uuid(),
            ownerId: ownerId,
            type: Constants.DEFAULT_EVENT
        };
        subscriptions.push(s1);
        return master.emit("user.created", { id: "any", name: "Max" }, { meta: { user, ownerId }})
            .delay(10)
            .then(() => {
                // console.log(calls["flow.instance.created"]);
                expect(calls["flow.instance.created"]).toHaveLength(1);
                expect(calls["flow.instance.created"].filter(o => o.payload.processId == s1.processId && o.payload.ownerId == s1.ownerId)).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.type == s1.type && o.payload.token.status == Constants.EVENT_OCCURED)).toHaveLength(1);
            }); 
    });
    
    it("it should trigger events for subscriptions for internal events",() => {
        let s1 = {
            processId: uuid(),
            versionId: uuid(),
            elementId: uuid(),
            ownerId: credentials.adminGroupId,
            type: Constants.DEFAULT_EVENT
        };
        subscriptions.splice(0,1);
        subscriptions.push(s1);
        return master.emit("user.created", { id: "any", name: "Max" }, { meta: { user }})
            .delay(10)
            .then(() => {
                // console.log(calls["flow.instance.created"]);
                expect(calls["flow.instance.created"]).toHaveLength(1);
                expect(calls["flow.instance.created"].filter(o => o.payload.processId == s1.processId && o.payload.ownerId == s1.ownerId)).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.type == s1.type && o.payload.token.status == Constants.EVENT_OCCURED)).toHaveLength(1);
            }); 
    });
    
    it("it should activate timer of intermediate event",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.TIMER_EVENT,
            position: Constants.INTERMEDIATE_EVENT,
            status: Constants.EVENT_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        let time = new Date();
        time.setDate(time.getUTCDate() + 2);
        time.setHours(time.getUTCHours() + 23);
        time.setMinutes(time.getUTCMinutes() + 12);
        process.current = {
            processId: token.processId,
            versionId: token.versionId,
            elementId: token.elementId,
            type: token.type,
            attributes: {
                wait: {
                    days: 2,
                    hours: 23,
                    minutes: 12
                }
            }
        };        
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                // console.log(calls["flow.timer.schedule"]);
                expect(calls["flow.timer.schedule"].filter(o => o.payload.payload.token == token && ( o.payload.time.getUTCHours() >= time.getUTCHours() ) )).toHaveLength(1);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.status == Constants.EVENT_ACTIVATED)).toHaveLength(1);
            }); 
    });

    it("it should emit event occured",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.TIMER_EVENT,
            position: Constants.INTERMEDIATE_EVENT,
            status: Constants.EVENT_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        return master.emit("flow.event.scheduled", { token })
            .delay(10)
            .then(() => {
                // console.log(calls["flow.timer.schedule"]);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.type == token.type && o.payload.token.status == Constants.EVENT_OCCURED)).toHaveLength(1);
            }); 
    });
    
    it("it should schedule first",() => {
        let event = {
            processId: uuid(),
            versionId: uuid(),
            id: uuid(),
            name: "any",
            type: Constants.TIMER_EVENT,
            position: Constants.START_EVENT,
            attributes: {
                cron: "10 23 * * *"
            },
            ownerId: ownerId
        };
        let next = new Date();
        next.setHours(23);
        next.setMinutes(10);
        next.setSeconds(0);
        next.setMilliseconds(0);
        console.log(next);
        return master.emit("flow.event.timer.init", event)
            .delay(10)
            .then(() => {
                // console.log(calls["flow.timer.schedule"]);
                // this.broker.emit("flow.timer.schedule", { event: "flow.event.scheduled", time: next, payload: { token } } );
                // console.log(calls["flow.timer.schedule"].filter(o => o.payload.event == "flow.event.scheduled"));
                //expect(calls["flow.timer.schedule"].filter(o => o.payload.event == "flow.event.scheduled")).toHaveLength(1);
                expect(calls["flow.timer.schedule"].filter(o => o.payload.event == "flow.event.scheduled" && o.payload.time.valueOf() === next.valueOf())).toHaveLength(1);
                expect(calls["flow.timer.schedule"][0].payload.payload.token).toBeDefined();
                expect(calls["flow.timer.schedule"][0].payload.payload.token.processId).toEqual(event.processId);
                expect(calls["flow.timer.schedule"][0].payload.payload.token.attributes.cyclic).toEqual(true);
                expect(calls["flow.timer.schedule"][0].payload.payload.token.instanceId).toBeDefined();
            }); 
    });
    
    it("it should emit occured and schedule next",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.TIMER_EVENT,
            // position: Constants.START_EVENT,
            status: Constants.EVENT_OCCURED,
            attributes: {
                cyclic: true
            },
            user: {},
            ownerId: ownerId
        };
        process.current = {
            processId: uuid(),
            id: uuid(),
            name: "any",
            type: Constants.TIMER_EVENT,
            position: Constants.START_EVENT,
            attributes: {
                cron: "10 23 * * *"
            },
            ownerId: ownerId
        };        
        let next = new Date();
        next.setHours(23);
        next.setMinutes(10);
        next.setSeconds(0);
        next.setMilliseconds(0);
        console.log(next);
        return master.emit("flow.event.scheduled", { token })
            .delay(10)
            .then(() => {
                // console.log(calls["flow.timer.schedule"]);
                // this.broker.emit("flow.timer.schedule", { event: "flow.event.scheduled", time: next, payload: { token } } );
                // console.log(calls["flow.timer.schedule"].filter(o => o.payload.event == "flow.event.scheduled"));
                //expect(calls["flow.timer.schedule"].filter(o => o.payload.event == "flow.event.scheduled")).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.type == token.type && o.payload.token.status == Constants.EVENT_OCCURED)).toHaveLength(1);
                expect(calls["flow.timer.schedule"].filter(o => o.payload.event == "flow.event.scheduled" && o.payload.time.valueOf() === next.valueOf())).toHaveLength(1);
                expect(calls["flow.timer.schedule"][0].payload.payload.token).toBeDefined();
                expect(calls["flow.timer.schedule"][0].payload.payload.token.processId).toEqual(token.processId);
                expect(calls["flow.timer.schedule"][0].payload.payload.token.attributes.cyclic).toEqual(true);
                expect(calls["flow.timer.schedule"][0].payload.payload.token.instanceId).toBeDefined();
            }); 
    });
});