// const {feel} = require("js-feel")();

// mock service feel
const Feel = {
    name: "flow.feel",
    actions: {
        evaluate: {
            params: {
                expression: { type: "string" },
                context: { type: "object" }
            },			
            async handler(ctx) {
                this.logger.info("feel called", { params: ctx.params, meta: ctx.meta } );
                // let parsedGrammar = feel.parse(ctx.params.expression);
                // return parsedGrammar.build(ctx.params.context);
                return null;
            }
        }
    }
};

module.exports = {
    Feel
};