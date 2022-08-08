// helper - test service call

const call = {};
const MyService = {
    name: "my",
    actions: {
        service: {
            acl: "before",
            params: {
                number: { type: "string" },
                status: { type: "string" }
            },
            async handler(ctx) {
                this.logger.info("my.service called", { params: ctx.params, return: call.result } );
                return call.result;
            }
        }
    }
};

module.exports = {
    test: call,
    MyService
};
