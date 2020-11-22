"use strict";

const { ServiceBroker } = require("moleculer");
const { Constants } = require("imicros-flow-control");
const Token = require("../lib/token");
const Next = require("../lib/next");
const Sequence = require("../lib/sequence");
const { v4: uuid } = require("uuid");

// helper & mocks
const { Collect, clear } = require("./helper/collect");
const { Query, process } = require("./helper/query");
const { Context } = require("./helper/context");
const { ACL, user, ownerId } = require("./helper/acl");

const calls = [];
const CollectEvents = Object.assign(Collect,{ settings: { calls: calls }});
const QueryACL = Object.assign(Query,{ settings: { ownerId: ownerId }});

describe("Test next service", () => {

    const [master] = ["master"].map(nodeID => {
        return new ServiceBroker({
            namespace: "token",
            nodeID: nodeID,
            // transporter: "nats://192.168.2.124:4222",
            // logLevel: "info" //"debug"
            logger: false 
        });        
    });    
    
    // Load services
    [CollectEvents, Token, Next, Sequence, Context, QueryACL, ACL].map(service => { return master.createService(service); }); 
    // const [collect, token, activity, query] = [CollectEvents, Token, Activity, Query].map(service => { return master.createService(service); }); 

    // Start & Stop
    beforeAll(() => Promise.all([master.start()]));
    afterAll(() => Promise.all([master.stop()]));

    beforeEach(() => clear(calls));
    
    it("it should activate next action",() => {
        let token = {
            processId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.SEQUENCE_STANDARD,
            status: Constants.SEQUENCE_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        process.next = [{ processId: token.processId, uid: uuid(), type: Constants.SERVICE_TASK },
                        { processId: token.processId, uid: uuid(), type: Constants.SERVICE_TASK }];
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                // console.log(calls["flow.token.emit"]);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.type == Constants.SERVICE_TASK && o.payload.token.status == Constants.ACTIVITY_ACTIVATED)).toHaveLength(2);
                expect(calls["flow.activity.activated"]).toHaveLength(2);
            }); 
    });
    
    it("it should emit activation tokens for conditional and default sequence with attributes",() => {
        let token = {
            processId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.SERVICE_TASK,
            status: Constants.ACTIVITY_COMPLETED,
            user: user,
            ownerId: ownerId
        };
        const [ s1, s2, s3 ] = [uuid(), uuid(), uuid()];
        process.next = [{ processId: token.processId, uid: s1, type: Constants.SEQUENCE_CONDITIONAL },
                        { processId: token.processId, uid: s2, type: Constants.SEQUENCE_CONDITIONAL },
                        { processId: token.processId, uid: s3, type: Constants.SEQUENCE_DEFAULT }];
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                // console.log(calls["flow.token.emit"]);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.type === Constants.SEQUENCE_CONDITIONAL && o.payload.token.status === Constants.SEQUENCE_ACTIVATED && o.payload.token.attributes.defaultSequence === s3)).toHaveLength(2);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.type === Constants.SEQUENCE_DEFAULT && o.payload.token.status === Constants.SEQUENCE_ACTIVATED && o.payload.token.attributes.waitFor.length === 2)).toHaveLength(1);
                expect(calls["flow.sequence.activated"]).toHaveLength(3);
            }); 
    });
    
});