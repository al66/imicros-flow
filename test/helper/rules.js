// mock service rules
const rule = {};
const Rules = {
    name: "rules",
    actions: {
        eval: {
            params: {
                name: [{ type: "string" },{ type: "array" }],
                data: { type: "object" }
            },
            async handler(ctx) {
                this.logger.info("rules.eval called", { params: ctx.params, rule } );
                return rule.result;
            }
        }
    }
};

module.exports = {
    rule,
    Rules
};
