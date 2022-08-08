// mock service queue (worker)
const Queue = {
    name: "queue",
    actions: {
        add: {
            acl: "before",
            params: {
                serviceId: { type: "uuid" },
                value: { type: "any" },
                token: { type: "object", optional: true }
            },
            async handler(ctx) {
                this.logger.info("queue called", { params: ctx.params, meta: ctx.meta } );
                return true;
            }
        }        
    }
};

module.exports = {
    Queue
};