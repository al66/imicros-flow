"use strict";

const { ServiceBroker } = require("moleculer");
const dbMixin = require("../lib/db.neo4j");


beforeAll( async () => {
});

afterAll( async () => {
});

const Test = {
    name: "test.db",
    mixins: [dbMixin],
    settings: { 
        uri: process.env.URI || "bolt://localhost:7687",
        user: "neo4j",
        password: "neo4j"
    }, 
    actions: {
        run(ctx) {
            return this.run(ctx.params)
            .then(res => {
                return res;
            });    
        }
    }
};

describe("Test db.neo4j", () => {

    let broker, service;
    beforeAll(async () => {
        broker = new ServiceBroker({
            logger: console,
            logLevel: "info"
        });
        service = broker.createService(Test);
        await broker.start();
    });

    afterAll(async (done) => {
        await broker.stop().then(() => done());
    });
    
    it("service should be created", () => {
        expect(service).toBeDefined();
    });

    it("sample node should be added", async () => {
        expect.assertions(4);
        let res = await broker.call("test.db.run","CREATE (ee:Person { name: 'Horst', from: 'Germany' })");
        expect(res).toBeDefined();
        res = await broker.call("test.db.run","MATCH (ee:Person) WHERE ee.name = 'Horst' RETURN ee;");
        expect(res).toBeDefined();
        expect(res[0].ee).toBeDefined();
        expect(res[0].ee.properties).toEqual(expect.objectContaining({ name: "Horst", from: "Germany" }));
    });
    
    it("should log syntax error", async () => {
        expect.assertions(1);
        let res = await broker.call("test.db.run","WRONG STATEMENT");
        expect(res).not.toBeDefined();
    });
    
    it("should create service with defaults", async () => {
        let withDefaults = {
            name: "test.db.defaults",
            mixins: [dbMixin]
        };
        let defaults = await broker.createService(withDefaults);
        expect(defaults).toBeDefined();
    });
    
});
