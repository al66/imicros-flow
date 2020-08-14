const process = {};
const subscriptions = [];

// mock service query
const Query = {
    name: "flow.query",
    actions: {
        getTask: {
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.Task called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== this.ownerId) return false;
                return [process.current];
            }
        },
        getSequence: {
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.getSequence called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== this.ownerId) return false;
                return [process.current];
            }
        },
        getEvent: {
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.getEvent called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== this.ownerId) return false;
                return [process.current];
            }
        },
        getGateway: {
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.getGateway called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== this.ownerId) return false;
                return [process.current];
            }
        },
        subscriptions: {
            params: {
                name: { type: "string" },
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
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.next called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== this.ownerId) return false;
                return process.next;
            }
        },
        previous: {
            params: {
                processId: { type: "uuid" },
                elementId: { type: "uuid" }
            },			
            async handler(ctx) {
                this.logger.info("query.previous called", { params: ctx.params, meta: ctx.meta, process: process } );
                if (ctx.meta.ownerId !== this.ownerId) return false;
                return process.previous;
            }
        }
    },
    created () {
        this.ownerId = (this.settings && this.settings.ownerId) ? this.settings.ownerId : "undefined";
    }
};

module.exports = {
    process: process,
    subscriptions: subscriptions,
    Query: Query
};