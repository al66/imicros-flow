// mock service flow.context
let context = {};

function setContext (instanceId, c) {
    context[instanceId] = c;
}

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
                this.logger.info("context.add called", { params: ctx.params, meta: ctx.meta });
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
                this.logger.info("context.getKeys called", { params: ctx.params, meta: ctx.meta });
                return context[ctx.params.instanceId];
            }
        },
        saveToken: {
            params: {
                processId: { type: "uuid" },
                instanceId: { type: "uuid" },
                elementId: { type: "uuid", optional: true },
                token: { 
                    type: "object",
                    props: {
                        processId: { type: "uuid" },
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
                let key = `${ctx.params.processId}-${ctx.params.instanceId}`;
                if (ctx.params.elementId) {
                    key = `${ctx.params.processId}-${ctx.params.instanceId}-${ctx.params.elementId}`;
                }
                if (!context[key]) {
                    context[key] = {
                        last: ctx.params.token,
                        token: [ctx.params.token]
                    };
                } else {
                    context[key].last = ctx.params.token;
                    context[key].token.push(ctx.params.token);
                }
                this.logger.info("token stored", { params: ctx.params } );
                return true;
            }
        },
        removeToken: {
            params: {
                processId: { type: "uuid" },
                instanceId: { type: "uuid" },
                elementId: { type: "uuid", optional: true },
                token: { 
                    type: "object",
                    props: {
                        processId: { type: "uuid" },
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
                let key = `${ctx.params.processId}-${ctx.params.instanceId}`;
                if (ctx.params.elementId) {
                    key = `${ctx.params.processId}-${ctx.params.instanceId}-${ctx.params.elementId}`;
                }
                if (context[key] && context[key].token) {
                    context[key].token = context[key].token.filter((token) => { return token !== ctx.params.token; });
                }
                this.logger.info("token removed", { params: ctx.params } );
                return true;
            }
        },
        getToken: {
            params: {
                processId: { type: "uuid" },
                instanceId: { type: "uuid" },
                elementId: { type: "uuid", optional: true }
            },
            async handler(ctx) {
                let key = `${ctx.params.processId}-${ctx.params.instanceId}`;
                if (ctx.params.elementId) {
                    key = `${ctx.params.processId}-${ctx.params.instanceId}-${ctx.params.elementId}`;
                }
                if (!context[key]) {
                    this.logger.debug("unkown key", { params: ctx.params });
                    return { token: [] };
                }
                this.logger.info("return result", { status: context[key] } );
                return context[key];
            }
        }
    }
};

module.exports = {
    context: context,
    Context: Context,
    setContext
};