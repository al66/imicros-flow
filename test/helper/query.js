const process = {};

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
        }
    },
    created () {
        this.ownerId = (this.settings && this.settings.ownerId) ? this.settings.ownerId : "undefined";
    }
};

module.exports = {
    process: process,
    Query: Query
};