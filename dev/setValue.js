// _.omit(ctx.meta, ["acl","auth","token","accessToken","serviceToken"])


function omit(obj, pathes) {
    if (Object(obj) !== obj || !Array.isArray(pathes)) return obj; // When obj is not an object
    for (let i = 0; i < pathes.length; i++) obj = set(obj, pathes[i], undefined);
    return obj;
}

function set(obj, path, value) {
    if (Object(obj) !== obj) return obj; // When obj is not an object
    // If not yet an array, get the keys from the string-path
    if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || [];
    if (value !== undefined) {
        path.slice(0,-1).reduce((a, c, i) => // Iterate all of them except the last one
             Object(a[c]) === a[c] // Does the key exist and is its value an object?
                 // Yes: then follow that path
                 ? a[c] 
                 // No: create the key. Is the next key a potential array-index?
                 : a[c] = Math.abs(path[i+1])>>0 === +path[i+1] 
                       ? [] // Yes: assign a new array object
                       : {}, // No: assign a new plain object
             obj)[path[path.length-1]] = value; // Finally assign the value to the last key

    } else {
        delete path.slice(0,-1).reduce((a, c) => // Iterate all of them except the last one
             Object(a[c]) === a[c] // Does the key exist and is its value an object?
                 // Yes: then follow that path
                 ? a[c] 
                 // No: stop here
                 : {},
              obj)[path[path.length-1]]; // Finally delete the last key
    }
    return obj; // Return the top-level object to allow chaining}
}
    
console.log(set({ "first": {} },"first.second.third", "property"));
console.log(omit(set({ "first": {} },"first.second.third", "property"),["first.second.third"]));
console.log(omit(set({ "first": {} },"first.second.third", "property"),["first.second"]));
console.log(omit({ "first": {} },["first.second.third"]));
