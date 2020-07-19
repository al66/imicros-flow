// mock service flow.store
const store = [];
const Store = {
    name: "flow.store",
    actions: {
        saveToken: {
            params: {
                processId: { type: "uuid" },
                instanceId: { type: "uuid" },
                elementId: { type: "uuid" },
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
                let key = `${ctx.params.processId}-${ctx.params.instanceId}-${ctx.params.elementId}`;
                if (!store[key]) {
                    store[key] = {
                        last: ctx.params.token,
                        token: [ctx.params.token]
                    };
                } else {
                    store[key].last = ctx.params.token;
                    store[key].token.push(ctx.params.token);
                }
                this.logger.info("token stored", { params: ctx.params } );
                return true;
            }
        },
        getToken: {
            params: {
                processId: { type: "uuid" },
                instanceId: { type: "uuid" },
                elementId: { type: "uuid" }
            },
            async handler(ctx) {
                let key = `${ctx.params.processId}-${ctx.params.instanceId}-${ctx.params.elementId}`;
                if (!store[key]) this.logger.error("Unvalid key", { params: ctx.params });
                this.logger.info("return result", { status: store[key] } );
                return store[key];
            }
        }
    }
};

module.exports = {
    store,
    Store
};
