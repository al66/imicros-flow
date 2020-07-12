const _ = require("../lib/util/lodash");

console.log("_.get", _.get({ first: { second: { third: "property" } } },"first.second.third"));
console.log("_.cloneDeep", _.cloneDeep({ first: { second: { third: "property" } } }));

