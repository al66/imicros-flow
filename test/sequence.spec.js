"use strict";

const { ServiceBroker } = require("moleculer");
const { Constants } = require("imicros-flow-control");
const Token = require("../lib/token");
const Sequence = require("../lib/sequence");
const { v4: uuid } = require("uuid");

// helper
const { Collect, clear } = require("./helper/collect");
const { ACL, user, ownerId } = require("./helper/acl");
const { Query, process } = require("./helper/query");
const { Context, context } = require("./helper/context");
const { Rules, rule } = require("./helper/rules");
const { Store, store } = require("./helper/store");

const calls = [];
const CollectEvents = Object.assign(Collect,{ settings: { calls: calls }});
const QueryACL = Object.assign(Query,{ settings: { ownerId: ownerId }});

describe("Test sequence service", () => {

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
    [CollectEvents, Token, Sequence, Context, QueryACL, ACL, Rules, Store].map(service => { return master.createService(service); }); 

    // Start & Stop
    beforeAll(() => Promise.all([master.start()]));
    afterAll(() => Promise.all([master.stop()]));

    beforeEach(() => clear(calls));
    
    it("it should emit new token with status SEQUENCE_COMPLETED",() => {
        let token = {
            processId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.SEQUENCE_STANDARD,
            status: Constants.SEQUENCE_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                // console.log(calls);
                expect(calls["flow.sequence.activated"]).toHaveLength(1);
                expect(calls["flow.sequence.activated"].filter(o => o.payload.token == token)).toHaveLength(1);
                // calls["flow.token.emit"].map(o => console.log(o.payload));
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.SEQUENCE_COMPLETED)).toHaveLength(1);
            }); 
    });

    it("it should evaluate ruleset and emit sequence completed token", () => {
        let sequenceId = uuid();
        let token = {
            processId: uuid(),
            instanceId: uuid(),
            elementId: sequenceId,
            type: Constants.SEQUENCE_CONDITIONAL,
            status: Constants.SEQUENCE_ACTIVATED,
            user: user,
            ownerId: ownerId,
            attributes: {
                defaultSequence: uuid(),
                waitFor: [sequenceId]
            }
        };
        process.current = {
            processId: token.processId,
            elementId: token.elementId,
            type: token.type,
            attributes: {
                contextKeys: ["inputA", "inputB"],  // not used
                ruleset: "myRule",
                resultKey: "myRule"
            }
        };
        rule.result = {
            myRule: true
        };
        return master.emit("flow.token.emit", { token })
            .delay(20)
            .then(() => {
                // console.log(calls);
                expect(calls["flow.sequence.activated"].filter(o => o.payload.token == token)).toHaveLength(1);
                // calls["flow.token.emit"].map(o => console.log(o.payload));
                // calls["flow.sequence.evaluated"].map(o => console.log(o.payload));
                expect(calls["flow.sequence.evaluated"].filter(o => o.payload.token.attributes == token.attributes)).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.SEQUENCE_COMPLETED)).toHaveLength(1);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.SEQUENCE_ACTIVATED)).toHaveLength(1);
            }); 
    });
    
    it("it should emit default sequence completed token", () => {
        let sequenceId = uuid();
        let token = {
            processId: uuid(),
            instanceId: uuid(),
            elementId: sequenceId,
            type: Constants.SEQUENCE_CONDITIONAL,
            status: Constants.SEQUENCE_REJECTED,
            user: user,
            ownerId: ownerId,
            attributes: {
                defaultSequence: uuid(),
                waitFor: [sequenceId]
            }
        };
        return master.emit("flow.sequence.evaluated", { token })
            .delay(20)
            .then(() => {
                // console.log(store);
                expect(calls["flow.sequence.evaluated"].filter(o => o.payload.token == token)).toHaveLength(1);
                // calls["flow.token.emit"].map(o => console.log(o.payload));
                // calls["flow.sequence.evaluated"].map(o => console.log(o.payload));
                // expect(calls["flow.sequence.evaluated"].filter(o => o.payload.token.attributes == token.attributes)).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.SEQUENCE_COMPLETED)).toHaveLength(1);
            }); 
    });
    
});