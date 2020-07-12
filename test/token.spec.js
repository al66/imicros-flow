"use strict";

const { ServiceBroker } = require("moleculer");
const { Constants } = require("imicros-flow-control");
const Token = require("../lib/token");
const Sequence = require("../lib/sequence");
const { v4: uuid } = require("uuid");

// helper
const { Collect } = require("./helper/collect");
const { user, ownerId } = require("./helper/acl");

const calls = [];
const CollectEvents = Object.assign(Collect,{ settings: { calls: calls }});


describe("Test token service", () => {

    const [master] = ["master"].map(nodeID => {
        return new ServiceBroker({
            namespace: "token",
            nodeID: nodeID,
            // transporter: "nats://192.168.2.124:4222",
            // logLevel: "debug" //"debug"
            logger: false 
        });        
    });
    
    
     // Load services
    const [collect, token, sequence] = [CollectEvents, Token, Sequence].map(service => { return master.createService(service); }); 

    // Start & Stop
    beforeAll(() => Promise.all([master.start()]));
    afterAll(() => Promise.all([master.stop()]));

    
    it("it should emit new flow.event.activated",() => {
        let token = {
            processId: uuid(),
            instanceId: uuid(),
            elementId: uuid(),
            type: Constants.DEFAULT_EVENT,
            status: Constants.EVENT_ACTIVATED,
            user: user,
            ownerId: ownerId
        };
        return master.emit("flow.token.emit", { token })
            .delay(10)
            .then(() => {
                // console.log(calls);
                expect(calls["flow.token.emit"]).toHaveLength(1);
                expect(calls["flow.token.emit"].filter(o => o.payload.token == token)).toHaveLength(1);
                expect(calls["flow.event.activated"]).toHaveLength(1);
                expect(calls["flow.event.activated"].filter(o => o.payload.token == token)).toHaveLength(1);
            }); 
    });

    
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
    
});