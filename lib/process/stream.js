/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
 "use strict";

 const {Context, Instance} = require("./main");
 const { DB } = require("../db/cassandra");

 module.exports = {
    name: "flow.stream",
    
    /**
     * Service settings
     */
     settings: {
        /*
        db: { 
                contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                keyspace: process.env.CASSANDRA_KEYSPACE_FLOW || "imicros_flow",
                contextTable: "context",
                instanceTable: "instances",
                tokenTable: "log"
            }         
        services: {
            context: "flow.context",
            query: "flow.query",
            acl: "acl",
        }
        */        
    },

    /**
     * Service metadata
     */
    metadata: {},

    /**
     * Service dependencies
     */
    // dependencies: ["agents"],	

    /**
     * Actions
     */
    actions: {},

    /**
     * Events
     */
    events: { 

        "flow.token.emit": {
            params: {
                token: { 
                    type: "object",
                    props: {
                        processId: { type: "uuid" },
                        versionId: { type: "uuid" },
                        instanceId: { type: "uuid" },
                        elementId: { type: "uuid", optional: true },
                        type: { type: "string" },
                        status: { type: "string" },
                        user: { type: "object" },
                        ownerId: { type: "string" },
                        attributes: { type: "object", optional: true}
                    }
                }
            },
            async handler(ctx) {
                await Instance.processToken({ token: ctx.params.token });
            }
        }
    
    },

    /**
     * Methods
     */
    methods: {},

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        this.services = {
            acl: this.settings?.services?.acl ?? "acl",
            agents: this.settings?.services?.agents ?? "agents",
            keys: this.settings?.services?.keys ?? "keys",
            queue: this.settings?.services?.queue ?? "queue",
            feel: this.settings?.services?.feel ?? "feel"
        };
        
    },
    /**
     * Service started lifecycle event handler
     */
    async started() {

        await this.broker.waitForServices(Object.values(this.services));

        // login to agents service and retrieve token for service authentication at imicros-acl
        this.serviceId = process.env.SERVICE_ID;
        const authToken = process.env.SERVICE_AUTH_TOKEN;        
        const { serviceToken } = await this.broker.call(this.services.agents + ".login", { serviceId: this.serviceId, authToken});
        if (!serviceToken) throw new Error("failed to login service");
        this.serviceToken = serviceToken;

        // create db access object
        this.db = new DB({broker: this.broker, options: this.settings?.db, services: this.services });

        // set context for db and Instance
        Context.set({ broker: this.broker, db: this.db, services: this.services, serviceId: this.serviceId, serviceToken: this.serviceToken });

        // connect to cassandra
        await this.db.connect();
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {

        // disconnect from cassandra
        await this.db.disconnect();

    }
    
};