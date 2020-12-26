const {feel} = require("js-feel")();

const rule = "a + b - c";
const context = {
    a: 10,
    b: 20,
    c: 5
};
 
const parsedGrammar = feel.parse(rule);
parsedGrammar.build(context).then(result => {
    console.log(result);
})
.catch(err => console.error(err));
