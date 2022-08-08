// const {feel} = require("js-feel")();

const requests = {};

function setFeelRequest({ path, value }) {
    requests[path] = value;
}

// mock service feel
const Feel = {
    name: "feel",
    actions: {
        evaluate: {
            params: {
                expression: [
                    { type: "string" },
                    { type: "object", props: { objectName: { type: "string" } } },
                    { type: "object", props: { xml: { type: "string" } } }
                ],
                context: { type: "object" }
            },			
            async handler(ctx) {
                this.logger.info("feel called", { params: ctx.params, meta: ctx.meta } );
                // let parsedGrammar = feel.parse(ctx.params.expression);
                // return parsedGrammar.build(ctx.params.context);
                return requests[ctx.params.expression.objectName];
            }
        }
    }
};

module.exports = {
    Feel,
    setFeelRequest
};