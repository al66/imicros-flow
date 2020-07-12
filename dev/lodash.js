const _ = require("../lib/util/lodash");

console.log("_.get", _.get({ first: { second: { third: "property" } } },"first.second.third"));
console.log("_.cloneDeep", _.cloneDeep({ first: { second: { third: "property" } } }));
console.log("_.set", _.set({ "first": {} },"first.second.third", "property"));
console.log("_.imit", _.omit({ "first": {} },["first.second.third"]));