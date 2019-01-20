let a = [{ key: "my.event", payload: "any" }];
let context = {};

for (let i=0; i<a.length; i++) {
    let obj = context;
    let path = a[i].key.split(".");
    for (let n = 0; n < path.length - 1; n++) {
        if (!obj[path[n]]) obj[path[n]] = {};
        obj = obj[path[n]];
    }
    obj[path[path.length-1]] = a[i].payload;
}

console.log(context);