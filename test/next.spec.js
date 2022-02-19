"use strict";

const { ServiceBroker } = require("moleculer");
const { Constants } = require("imicros-flow-control");
const { AclMiddleware } = require("imicros-acl");
const { Next } = require("../index");
const { Sequence } = require("../index");
const { Activity } = require("../index");
const { v4: uuid } = require("uuid");

// helper & mocks
const { Collect, clear } = require("./helper/collect");
const { Query, process } = require("./helper/query");
const { Context } = require("./helper/context");
const { ACL, user, meta } = require("./helper/acl");
const { Agents } = require("./helper/agents");
const { Rules } = require("./helper/rules");
// const { Feel } = require("./helper/feel");
const { Queue } = require("./helper/queue");
const { credentials } = require("./helper/credentials");

const calls = [];
const CollectEvents = Object.assign(Collect,{ settings: { calls: calls }});
const ownerId = credentials.ownerId;

describe("Test next service", () => {

    const [master] = ["master"].map(nodeID => {
        return new ServiceBroker({
            namespace: "token",
            nodeID: nodeID,
            middlewares: [AclMiddleware({ service: "acl" })],
            // transporter: "nats://192.168.2.124:4222",
            logLevel: "debug" // "info" //"debug"
            // logger: false 
        });        
    });    
    
    // Load services
    [CollectEvents, Next, Sequence, Activity, Context, Query, ACL, Agents, Rules, Queue].map(service => { return master.createService(service); }); 
    // const [collect, token, activity, query] = [CollectEvents, Token, Activity, Query].map(service => { return master.createService(service); }); 

    // Start & Stop
    beforeAll(() => Promise.all([master.start()]));
    afterAll(async () => await Promise.all([master.stop()]));

    beforeEach(() => clear(calls));
    
    it("it should activate next action",() => {
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
        process.next = [
            { processId: token.processId, versionId: token.versionId, uid: uuid(), type: Constants.SERVICE_TASK },
            { processId: token.processId, versionId: token.versionId, uid: uuid(), type: Constants.SERVICE_TASK }
        ];
        // requested by activity prepare
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
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                expect(calls["flow.token.emit"].filter(o => o.payload.token.type == Constants.SERVICE_TASK && o.payload.token.status == Constants.ACTIVITY_ACTIVATED)).toHaveLength(2);
            })
            .then(() => {
                return master.call("flow.context.getToken", { processId: token.processId, instanceId: token.instanceId }, { meta })
                    .then(result => {
                        expect(result).toBeDefined();
                        expect(result.token).toEqual([]);
                    });
            }); 
    });
    
    it("it should emit 'flow.instance.completed'",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.SERVICE_TASK,
            status: Constants.ACTIVITY_COMPLETED,
            user: user,
            ownerId: ownerId
        };
        process.next = [];
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                expect(calls["flow.token.consume"].filter(o => o.payload.token.type == Constants.SERVICE_TASK && o.payload.token.status == Constants.ACTIVITY_COMPLETED)).toHaveLength(1);
                // console.log(calls);
                expect(calls["flow.instance.completed"].filter(o => o.payload.instanceId === token.instanceId)).toHaveLength(1);
            }); 
    });
    
    it("it should emit activation tokens for conditional and default sequence with attributes",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.SERVICE_TASK,
            status: Constants.ACTIVITY_COMPLETED,
            user: user,
            ownerId: ownerId
        };
        const [ s1, s2, s3 ] = [uuid(), uuid(), uuid()];
        process.next = [
            { processId: token.processId, versionId: token.versionId, uid: s1, type: Constants.SEQUENCE_CONDITIONAL },
            { processId: token.processId, versionId: token.versionId, uid: s2, type: Constants.SEQUENCE_CONDITIONAL },
            { processId: token.processId, versionId: token.versionId, uid: s3, type: Constants.SEQUENCE_DEFAULT }
        ];
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                // console.log(calls["flow.token.emit"]);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.type === Constants.SEQUENCE_CONDITIONAL && o.payload.token.status === Constants.SEQUENCE_ACTIVATED && o.payload.token.attributes.defaultSequence === s3)).toHaveLength(2);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.type === Constants.SEQUENCE_DEFAULT && o.payload.token.status === Constants.SEQUENCE_ACTIVATED && o.payload.token.attributes.waitFor.length === 2)).toHaveLength(1);
                // expect(calls["flow.sequence.activated"]).toHaveLength(3);
            }); 
    });
 
});