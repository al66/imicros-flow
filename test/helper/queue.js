// mock service queue (worker)
const queue = [];

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
                queue.push({ params: ctx.params, meta: ctx.meta });
                return true;
            }
        }        
    }
};

function clearQueue() {
    while (queue.length > 0) {
        queue.pop();
    }
}

function getQueue() {
    return queue;
}


module.exports = {
    Queue,
    getQueue,
    clearQueue
};