// mock service flow.context
let context = {};
const Context = {
    name: "flow.context",
    actions: {
        add: {
            params: {
                instanceId: { type: "uuid" },
                key: { type: "string" },
                value: { type: "any" }
            },
            handler(ctx) {
                this.logger.info("context.add called", { params: ctx.params });
                if (!context[ctx.params.instanceId]) context[ctx.params.instanceId] = [];
                context[ctx.params.instanceId][ctx.params.key] = ctx.params.value;
                return true;
            }
        },
        get: {
            params: {
                instanceId: { type: "uuid" },
                key: { type: "string" }
            },
            handler(ctx) {
                this.logger.info("context.get called", { params: ctx.params });
                return context[ctx.params.instanceId] ? context[ctx.params.instanceId][ctx.params.key] : null;
            }
        },
        getKeys: {
            params: {
                instanceId: { type: "uuid" },
                keys: { type: "array", item: "string" }
            },
            handler(ctx) {
                this.logger.info("context.getKeys called", { params: ctx.params });
                return context;
            }
        }
    }
};

module.exports = {
    context: context,
    Context: Context
};