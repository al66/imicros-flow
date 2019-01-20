
"use strict";

const { ServiceBroker } = require("moleculer");
const { Store } = require("../index");

const timestamp = Date.now();

beforeAll( async () => {
});

afterAll( async () => {
});

describe("Test db.neo4j", () => {

    let broker, store;
    beforeAll(() => {
        broker = new ServiceBroker({
            logger: console,
            logLevel: "info" //"debug"
        });
        store = broker.createService(Store, Object.assign({
            settings: { 
                redis: {
                    port: process.env.REDIS_PORT || 6379,
                    host: process.env.REDIS_HOST || "127.0.0.1",
                    password: process.env.REDIS_AUTH || "",
                    db: process.env.REDIS_DB || 0,
                }
            }
        }));
        return broker.start();
    });
    
    afterAll(async () => {
        await broker.stop();
    });
    
    describe("Test create service", () => {

        it("it should be created", () => {
            expect(store).toBeDefined();
        });
        
    });

    describe("Test add next", () => {

        let opts;
        beforeEach(() => {
            opts = { meta: { user: { id: `1-${timestamp}` , email: `1-${timestamp}@host.com` } } };
        });
        
        let obj1 = { any: "object",
            with: {
                deep: "structure"
            }
        };
        let obj2 = { any: "other object",
            with: {
                deep: "structure"
            }
        };
        let str = "<html><body></body></html>";
        let buf = Buffer.from("String");
        function testFunction(param1, param2) {
            return param1 + param2;
        }
        
        it("it should add an object", () => {
            let params = {
                contextId: "Hash",
                key: "key1",
                value: obj1
            };
            return broker.call("flow.store.add", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should add a second object", () => {
            let params = {
                contextId: "Hash",
                key: "key2",
                value: obj2
            };
            return broker.call("flow.store.add", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should add a string", () => {
            let params = {
                contextId: "Hash",
                key: "key3",
                value: str
            };
            return broker.call("flow.store.add", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should add an buffer", () => {
            let params = {
                contextId: "Hash",
                key: "key4",
                value: buf
            };
            return broker.call("flow.store.add", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should add a boolean", () => {
            let params = {
                contextId: "Hash",
                key: "key5",
                value: true
            };
            return broker.call("flow.store.add", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should add a number", () => {
            let params = {
                contextId: "Hash",
                key: "key6",
                value: 123456789
            };
            return broker.call("flow.store.add", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should add a function", () => {
            let params = {
                contextId: "Hash",
                key: "key7",
                value: testFunction
            };
            return broker.call("flow.store.add", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should return context", () => {
            let params = {
                contextId: "Hash"
            };
            return broker.call("flow.store.get", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(expect.objectContaining({
                    "key1": obj1,
                    "key2": obj2,
                    "key3": str,
                    "key4": buf,
                    "key5": true,
                    "key6": 123456789
                }));
                expect(res.key7("Hallo","Echo")).toEqual(testFunction("Hallo","Echo"));
                expect(res.key7("Hallo","Echo")).toEqual("HalloEcho");
            });
        });

        it("it should remove a key", () => {
            let params = {
                contextId: "Hash",
                key: "key2"
            };
            return broker.call("flow.store.rollback", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should return context without removed key", () => {
            let params = {
                contextId: "Hash"
            };
            return broker.call("flow.store.get", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(expect.objectContaining({
                    "key1": obj1,
                    "key3": str,
                    "key4": buf,
                    "key5": true,
                    "key6": 123456789
                }));
                expect(res).not.toHaveProperty("key2");
            });
        });
        
    });
    
});