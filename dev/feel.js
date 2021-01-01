const {feel} = require("js-feel")();

const rule = "a + b - c + test.x";
const context = {
    a: 10,
    b: 20,
    c: 5,
    test: {
        x: 1
    }
};
 
const parsedGrammar = feel.parse(rule);
parsedGrammar.build(context).then(result => {
    console.log(result);
})
.catch(err => console.error(err));
