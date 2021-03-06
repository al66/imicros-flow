"use strict";

const { ServiceBroker } = require("moleculer");
const { Constants } = require("imicros-flow-control");
const { AclMiddleware } = require("imicros-acl");
const { Gateway } = require("../index");
const { Next } = require("../index");
const { v4: uuid } = require("uuid");
const _ = require("../lib/util/lodash");

// helper
const { Collect, LogActions, clear } = require("./helper/collect");
const { ACL, user } = require("./helper/acl");
const { Query, process } = require("./helper/query");
const { Context, context } = require("./helper/context");
const { Rules, rule } = require("./helper/rules");
const { Agents } = require("./helper/agents");
const { credentials } = require("./helper/credentials");

const calls = [];
const actions = [];
const CollectEvents = Object.assign(Collect,{ settings: { calls: calls }});
const ownerId = credentials.ownerId;

describe("Test sequence service", () => {

    const [master] = ["master"].map(nodeID => {
        return new ServiceBroker({
            namespace: "token",
            nodeID: nodeID,
            middlewares: [LogActions({ actions }), AclMiddleware({ service: "acl" })],
            // transporter: "nats://192.168.2.124:4222",
            logLevel: "info", //"debug"
            logger: true 
        });        
    });    
    
    // Load services
    [CollectEvents, Gateway, Next, Context, Query, ACL, Agents, Rules].map(service => { return master.createService(service); }); 

    // Start & Stop
    beforeAll(() => Promise.all([master.start()]));
    afterAll(() => Promise.all([master.stop()]));

    beforeEach(() => clear(calls));
    
    it("it should emit new token with status GATEWAY_COMPLETED",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.EXCLUSIVE_GATEWAY,
            status: Constants.GATEWAY_ACTIVATED,
            user: user,
            ownerId: ownerId,
            attributes: {
                lastElementId: uuid()
            }
        };
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                console.log(actions);
                calls["flow.token.emit"].map(o => console.log(o.payload));
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.GATEWAY_COMPLETED && o.payload.token.attributes.exclusiveGateway === true)).toHaveLength(1);
            }); 
    });

    it("it should emit gateway completed token", () => {
        const [ s1, s2, s3 ] = [uuid(), uuid(), uuid()];
        const token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.PARALLEL_GATEWAY,
            status: Constants.GATEWAY_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        const [ token1, token2, token3] = [ s1, s2, s3 ].map(s => {
            let t = _.cloneDeep(token);
            t.attributes = {
                lastElementId: s
            };
            return t;
        });
        process.previous = [{ processId: token1.processId, versionId: token1.versionId, uid: s1, type: Constants.SEQUENCE_STANDARD },
                            { processId: token1.processId, versionId: token1.versionId, uid: s2, type: Constants.SEQUENCE_CONDITIONAL },
                            { processId: token1.processId, versionId: token1.versionId, uid: s3, type: Constants.SEQUENCE_DEFAULT }];
        return master.emit("flow.token.emit", { token: token1 })
            .delay(10)
            .then(() => {
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token1.processId && o.payload.token.status ==  Constants.GATEWAY_COMPLETED)).toHaveLength(0);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token1.processId)).toHaveLength(1);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.processId == token1.processId && o.payload.token.status == Constants.GATEWAY_ACTIVATED)).toHaveLength(1);
            })
            .then(() => {
                master.emit("flow.token.emit", { token: token3 });
            })
            .delay(10)
            .then(() => {
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token1.processId)).toHaveLength(2);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.processId == token1.processId && o.payload.token.status == Constants.GATEWAY_ACTIVATED)).toHaveLength(2);
            })
            .then(() => {
                master.emit("flow.token.emit", { token: token2 });
            })
            .delay(10)
            .then(() => {
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token1.processId)).toHaveLength(4);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.processId == token1.processId && o.payload.token.status == Constants.GATEWAY_ACTIVATED)).toHaveLength(3);
                expect(calls["flow.token.emit"].filter(o => o.payload.token.processId == token1.processId && o.payload.token.status ==  Constants.GATEWAY_COMPLETED)).toHaveLength(1);
            });
    });    

    it("it should emit callback token with status GATEWAY_COMPLETED",() => {
        let token = {
            processId: uuid(),
            versionId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.EVENT_BASED_GATEWAY,
            status: Constants.GATEWAY_ACTIVATED,
            user: user,
            ownerId: ownerId,
            attributes: {
                lastElementId: uuid()
            }
        };
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                //calls["flow.token.emit"].map(o => console.log(o.payload));
                expect(calls["flow.token.emit"].filter(o => o.payload.token.status == Constants.GATEWAY_COMPLETED && o.payload.token.attributes.callback.event === "flow.gateway.eventBased.callback" && o.payload.token.attributes.callback.elementId === token.elementId && o.payload.token.attributes.lastElementId === token.attributes.lastElementId)).toHaveLength(1);
                expect(calls["flow.token.consume"].filter(o => o.payload.token.processId == token.processId && o.payload.token.status == Constants.GATEWAY_ACTIVATED)).toHaveLength(1);
            }); 
    });

    
});