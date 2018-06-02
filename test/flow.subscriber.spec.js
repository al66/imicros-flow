"use strict";
const { ServiceBroker } = require("moleculer");
const proxyquire = require('proxyquire');

//TODO: mock kafkajs for unit test
var mockKafkajs = {
};
const Subscriber = require("../lib/flow.subscriber");
//const Subscriber = proxyquire("../lib/flow.subscriber", { kafkajs: mockKafkajs });
const Publisher = proxyquire("../lib/flow.publisher", { kafkajs: mockKafkajs });

const timestamp = Date.now();
let flow = [];
const Action1 = {
    name: "action.1",
    actions: {
        call: {
            async handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params }
                console.log("called:", result)
                flow.push(result);
                return result;
            }
        }
    }
}
const Action2 = {
    name: "action.2",
    actions: {
        call: {
            async handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params }
                console.log("called:", result)
                flow.push(result);
                return result;
            }
        }
    }
}
const subscriptions = [
    {
        event: "test.*",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.2.call"
    }    
]


describe("Test subscriber service", () => {

    let broker, service, params, opts;
    beforeAll(() => {
        broker = new ServiceBroker({
            logger: console,
            logLevel: "info" //"debug"
        });
        broker.createService(Action1);
        broker.createService(Action2);
        broker.createService(Publisher, Object.assign({ settings: { brokers: ['192.168.2.124:9092'] } }));
        service = broker.createService(Subscriber, Object.assign({ settings: { brokers: ['192.168.2.124:9092'], subscriptions: subscriptions } }));
        return broker.start();
    });

    afterAll( async () => {
        await broker.stop();
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve()
          }, 500)
        })
    });
    

    describe("Test create service", () => {

        it("it should be created", () => {
			expect(service).toBeDefined();
		});
    });

    describe("Test subscribe for event ", () => {

        beforeEach(() => {
            flow = [];
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, groupId: `g-${timestamp}`, access: [`g-${timestamp}`] } }
        })

        it("it should subscribe for events of test.emit ", () => {
            let params = {
                event: "test.emit",
                params: { id: "meta.user.id", timestamp: Date.now() },
                action: "action.1.call"
            };
            return broker.call("flow.subscriber.subscribe", params, opts).then(res => {
                expect(res.success).toBeDefined();
                expect(res.subscription).toEqual(expect.objectContaining(params))
                expect(res.subscription.id).toBeDefined();
            });
        });

        it("it should emit an event for the subscription ", () => {
            let params = {
                event: "test.emit",
                payload: { msg: "say hello to the world" }
			};
            return broker.call("flow.publisher.emit", params, opts).then(res => {
                expect(res.success).toBeDefined();
                expect(res.content).toEqual(expect.objectContaining(params))
                expect(res.content.meta).toBeDefined();
            });
        });
        
        it("it should emit an event for the subscription ", () => {
            let params = {
                event: "test.other",
                payload: { msg: "say hello to the world" }
			};
            return broker.call("flow.publisher.emit", params, opts).then(async (res) => {
                expect(res.success).toBeDefined();
                expect(res.content).toEqual(expect.objectContaining(params))
                expect(res.content.meta).toBeDefined();
            });
        });

    });

});