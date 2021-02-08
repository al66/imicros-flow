const { credentials } = require("./credentials");
const _ = require("../../lib/util/lodash");

const process = {};
const subscriptions = [];

// mock service query
const Query = {
    name: "flow.query",
    actions: {
        getTask: {
            acl: "before",
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.Task called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== credentials.ownerId) return false;
                return [process.current];
            }
        },
        getSequence: {
            acl: "before",
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.getSequence called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== credentials.ownerId) return false;
                return [process.current];
            }
        },
        getEvent: {
            acl: "before",
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.getEvent called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== credentials.ownerId) return false;
                return [process.current];
            }
        },
        getGateway: {
            acl: "before",
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.getGateway called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== credentials.ownerId) return false;
                return [process.current];
            }
        },
        subscriptions: {
            visibility: "public",
            params: {
                eventName: { type: "string" },
                ownerId: { type: "string" },
                version: { type: "string", optional: true },
                id: { type: "string", optional: true },
                processId: { type: "uuid", optional: true },
                elementId: { type: "uuid", optional: true },
                instanceId: { type: "uuid", optional: true }
            },
            handler(ctx) {
                this.logger.info("query.subscriptions called", { params: ctx.params, meta: ctx.meta, subscriptions });
                return subscriptions;
            }
        },
        next: {
            acl: "before",
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.next called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== credentials.ownerId) return false;
                let next = _.cloneDeep(process.next);
                process.next = [];
                return next;
            }
        },
        previous: {
            acl: "before",
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.previous called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== credentials.ownerId) return false;
                return process.previous;
            }
        }
    }
};

module.exports = {
    process: process,
    subscriptions: subscriptions,
    Query: Query
};