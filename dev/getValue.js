const Benchmark = require("benchmark");

// proposal
function getValue(obj, path, defaultValue = undefined) {
    if (!path || typeof path !== "string" ) return null;
    let i;
    path = path.split(".");
    for (i = 0; i < path.length; i++) {
        if (!obj[path[i]]) {obj = null; break;}
        obj = obj[path[i]];
    }
    return obj || defaultValue;
}

// Native
function get(obj, path, defaultValue = undefined) {
    const travel = regexp =>
    String.prototype.split
      .call(path, regexp)
      .filter(Boolean)
      .reduce((res, key) => (res !== null && res !== undefined ? res[key] : res), obj);
    const result = travel(/[,[\]]+?/) || travel(/[,[\].]+?/);
    return result === undefined || result === obj ? defaultValue : result;
}

const suite = new Benchmark.Suite;
const obj = {
    first: {
        second: {
            third: "property"
        }
    }
};

console.log("proposal:", getValue(obj,"first.second.third", ["default"]));
console.log("proposal default:", getValue(obj,"first.second.any", ["default"]));
console.log("proposal:", get(obj,"first.second.third", ["default"]));
console.log("proposal default:", get(obj,"first.second.any", ["default"]));

suite.add("propsoal",() => getValue(obj,"first.second.third"))
.add("native",() => get(obj,"first.second.third"))

// add listeners
.on("cycle", function(event) {
    console.log(String(event.target));
})
.on("complete", function() {
    console.log("Fastest is " + this.filter("fastest").map("name"));
})
// run async
.run({ "async": true });


