// mock service timer
const queue = {};
const Timer = {
    name: "timer",
    events: {
        "flow.timer.schedule": {
            params: {
                event: { type: "string" },
                time: { type: "date" },
                payload: { type: "object" }
            },
            async handler(ctx) {
                console.log("Date: " + ctx.params.time + " - type: " + typeof ctx.params.time);
                this.logger.info("flow.timer.schedule called", { params: ctx.params, meta: ctx.meta } );
                queue[ctx.event] = {
                    event: ctx.event,
                    time: ctx.time,
                    meta: ctx.meta,
                    payload: ctx.payload
                };
                return true;
            }
        }
    }
};

module.exports = {
    queue,
    Timer
};
