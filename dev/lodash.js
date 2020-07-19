const _ = require("../lib/util/lodash");

console.log("_.get", _.get({ first: { second: { third: "property" } } },"first.second.third"));
console.log("_.get", _.get({ first: { second: { third: "property" } } },"first.second.fourth", "alternate"));
console.log("_.get", _.get(null,"first.second.fourth", "object is null"));
console.log("_.get", _.get("no object","first.second.fourth", "onject is string"));
console.log("_.get", _.get([],"first.second.fourth", "onject is array"));
console.log("_.get", _.get({ first: { second: { third: "property" } } },null, "unvalid path: null"));
console.log("_.get", _.get({ first: { second: { third: "property" } } },[], "unvalid path (array): null"));
console.log("_.get", _.get({ first: { second: { third: "property" } } },{}, "unvalid path (array): null"));
console.log("_.cloneDeep", _.cloneDeep({ first: { second: { third: "property" } } }));
console.log("_.set", _.set({ "first": {} },"first.second.third", "property"));
console.log("_.imit", _.omit({ "first": {} },["first.second.third"]));