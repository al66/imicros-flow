"use strict";

const { ServiceBroker } = require("moleculer");
const { Constants } = require("imicros-flow-control");
const { AclMiddleware } = require("imicros-acl");
const { Sequence } = require("../index");
const { Next } = require("../index");
const { v4: uuid } = require("uuid");

// helper
const { Collect, clear } = require("./helper/collect");
const { ACL, user } = require("./helper/acl");
const { Query, process } = require("./helper/query");
const { Context, setContext } = require("./helper/context");
const { Rules, rule } = require("./helper/rules");
const { Feel } = require("./helper/feel");
const { Agents } = require("./helper/agents");
const { credentials } = require("./helper/credentials");

const calls = [];
const CollectEvents = Object.assign(Collect,{ settings: { calls: calls }});
const ownerId = credentials.ownerId;

describe("Test sequence service", () => {

    const [master] = ["master"].map(nodeID => {
        return new ServiceBroker({
            namespace: "token",
            nodeID: nodeID,
            middlewares: [AclMiddleware({ service: "acl" })],
            // transporter: "nats://192.168.2.124:4222",
            logLevel: "debug"
            // logLevel: "info"
            //logger: false 
        });        
    });    
    
    // Load services
    [CollectEvents, Sequence, Next, Context, Query, ACL, Agents, Rules, Feel].map(service => { return master.createService(service); }); 

    // Start & Stop
    beforeAll(() => Promise.all([master.start()]));
    afterAll(() => Promise.all([master.stop()]));

    beforeEach(() => clear(calls));

    it("it should compute feel expression",() => {
        let params = {
            expression: "a + b - c",
            context: {
                a: 10,
                b: 20,
                c: 5
            }
        };
        return master.call("flow.feel.evaluate", params).then(result => {
            expect(result).toEqual(25);
        });
    });
    
    it("it should emit new token with status SEQUENCE_COMPLETED",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.SEQUENCE_STANDARD,
            status: Constants.SEQUENCE_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        process.current = {
            processId: token.processId,
            versionId: token.versionId,
            elementId: token.elementId,
            type: token.type
        };
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                console.log(calls);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.SEQUENCE_COMPLETED)).toHaveLength(1);
            }); 
    });

    it("it should evaluate ruleset and emit sequence completed token", () => {
        let sequenceId = uuid();
        let token = {
            processId: uuid(),
            versionId: uuid(),
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
            versionId: token.versionId,
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
            .delay(10)
            .then(() => {
                // console.log(calls);
                // calls["flow.token.emit"].map(o => console.log(o.payload));
                // calls["flow.sequence.evaluated"].map(o => console.log(o.payload));
                expect(calls["flow.sequence.evaluated"]).toHaveLength(1);
                expect(calls["flow.sequence.evaluated"][0].payload.token.attributes.defaultSequence).toEqual(token.attributes.defaultSequence);
                expect(calls["flow.sequence.evaluated"][0].payload.token.attributes.waitFor).toEqual(token.attributes.waitFor);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.SEQUENCE_COMPLETED)).toHaveLength(1);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.SEQUENCE_ACTIVATED)).toHaveLength(1);
            }); 
    });
    
    it("it should evaluate feel expression and emit sequence completed token", () => {
        let sequenceId = uuid();
        let token = {
            processId: uuid(),
            versionId: uuid(),
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
            versionId: token.versionId,
            elementId: token.elementId,
            type: token.type,
            attributes: {
                contextKeys: ["a", "b"],  // not used
                feel: "a + b = 3"
            }
        };
        setContext(token.instanceId, { a: 1, b: 2 });
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                expect(calls["flow.sequence.evaluated"]).toHaveLength(1);
                expect(calls["flow.sequence.evaluated"][0].payload.token.attributes.defaultSequence).toEqual(token.attributes.defaultSequence);
                expect(calls["flow.sequence.evaluated"][0].payload.token.attributes.waitFor).toEqual(token.attributes.waitFor);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.SEQUENCE_COMPLETED)).toHaveLength(1);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.SEQUENCE_ACTIVATED)).toHaveLength(1);
            }); 
    });
    
    it("it should evaluate feel expression due to proceeding exclusive gateway and emit sequence completed token", () => {
        let sequenceId = uuid();
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: sequenceId,
            type: Constants.SEQUENCE_STANDARD,
            status: Constants.SEQUENCE_ACTIVATED,
            user: user,
            ownerId: ownerId,
            attributes: {
                exclusiveGateway: true
            }
        };
        process.current = {
            processId: token.processId,
            versionId: token.versionId,
            elementId: token.elementId,
            type: token.type,
            attributes: {
                contextKeys: ["a", "b"],  // not used
                feel: "a + b = 3"
            }
        };
        setContext({ a: 1, b: 2 });
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                expect(calls["flow.sequence.evaluated"]).toHaveLength(0);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.SEQUENCE_COMPLETED)).toHaveLength(1);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.SEQUENCE_ACTIVATED)).toHaveLength(1);
            }); 
    });
    
    it("it should emit default sequence completed token", () => {
        let sequenceId = uuid();
        let token = {
            processId: uuid(),
            versionId: uuid(),
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
            .delay(10)
            .then(() => {
                // console.log(store);
                // expect(calls["flow.sequence.evaluated"].filter(o => o.payload.token == token)).toHaveLength(1);
                // calls["flow.token.emit"].map(o => console.log(o.payload));
                // calls["flow.sequence.evaluated"].map(o => console.log(o.payload));
                // expect(calls["flow.sequence.evaluated"].filter(o => o.payload.token.attributes == token.attributes)).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.SEQUENCE_COMPLETED)).toHaveLength(1);
            }); 
    });
    
});