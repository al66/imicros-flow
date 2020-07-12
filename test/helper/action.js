// helper - test service call

const call = {};
const Test = {
    name: "test",
    actions: {
        actionA: {
            params: {
                a: { type: "string" }
            },
            async handler(ctx) {
                this.logger.info("test.actionA called", { params: ctx.params, return: call.result } );
                return call.result;
            }
        }
    }
};

module.exports = {
    call: call,
    Test: Test
};
