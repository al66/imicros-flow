"use strict";
const { ServiceBroker } = require("moleculer");
const Publisher = require("../lib/flow.publisher");
const Subscriber = require("../lib/flow.static.subscriber");

const timestamp = Date.now();
let flow = [];
const Action1 = {
    name: "action.1",
    actions: {
        call: {
            async handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params }
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
                flow.push(result);
                return result;
            }
        }
    }
}
const Action3 = {
    name: "action.3",
    actions: {
        call: {
            async handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params }
                flow.push(result);
                console.log("Called:", result)
                return result;
            }
        }
    }
}
const subscriptions = [
    {
        id: "step.one"  + timestamp ,
        event: "test.emit",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.1.call"
    },    
    {
        id: "step.two" + timestamp ,
        event: "test.*",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.2.call",
        emit: "action.2.terminated"
    },    
    {
        event: "action.2.terminated",
        params: { id: "meta.user.id", timestamp: Date.now() },
        action: "action.3.call"
    }    
]
let broker  = new ServiceBroker({
    logger: console,
    logLevel: "debug" //"debug"
});

describe("Test subscriber service", () => {

    let service, params, opts;
    beforeAll(() => {
        broker.createService(Action1);
        broker.createService(Action2);
        broker.createService(Action3);
        broker.createService(Publisher, Object.assign({ settings: { brokers: ['192.168.2.124:9092'] } }));
        service = broker.createService(Subscriber, Object.assign({ settings: { brokers: ['192.168.2.124:9092'], subscriptions: subscriptions } }));
        return broker.start();
    });

    afterAll( async () => {
        try {
            
            await broker.stop();

            await new Promise((resolve, reject) => {
              setTimeout(() => {
                resolve()
              }, 100)
            })
            
        } catch (err) {
            consule.log(err)
            // check for open handles
            console.log(process._getActiveRequests());
            console.log(process._getActiveHandles());
        }
    });
    

    describe("Test create service", () => {

        it("it should be created", () => {
			expect(service).toBeDefined();
		});
    });

    describe("Test subscriptions w/o owner", () => {

        beforeEach(() => {
            flow = [];
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, groupId: `g-${timestamp}`, access: [`g-${timestamp}`] } }
        })

        it("'test.emit' should be received by both subscriptions ", () => {
            let params = {
                event: "test.emit",
                payload: { msg: "say hello to the world" }
			};
            return broker.call("flow.publisher.emit", params, opts).then(async res => {
                expect(res.success).toBeDefined();
                expect(res.content).toEqual(expect.objectContaining(params))
                expect(res.content.meta).toBeDefined();
                // wait some ticks...
                await new Promise((resolve, reject) => {
                  setTimeout(() => {
                    resolve()
                  }, 500)
                })
                expect(flow.length).toEqual(3);
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
                // wait some ticks...
                await new Promise((resolve, reject) => {
                  setTimeout(() => {
                    resolve()
                  }, 500)
                })
                expect(flow.length).toEqual(2);
            });
        });

    });
    
    /*
    describe("Test subscriptions with owner", () => {

        beforeEach(() => {
            flow = [];
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` }, groupId: `g-${timestamp}`, access: [`g-${timestamp}`] } }
        })

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
    */
    
});