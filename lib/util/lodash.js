/**
 * @license MIT, imicros.de (c) 2020 Andreas Leinen
 */
"use strict";

const clone = require("rfdc")();    // Really Fast Deep Clone

function get(obj, path, defaultValue = undefined) {
    if (Object(obj) !== obj) return defaultValue; 
    if (!path || typeof path !== "string" ) return null;
    let i;
    path = path.split(".");
    for (i = 0; i < path.length; i++) {
        if (!obj[path[i]]) {obj = null; break;}
        obj = obj[path[i]];
    }
    return obj || defaultValue;
}

function cloneDeep(obj) {
    // return Object.assign({}, obj); 
    // return JSON.parse(JSON.stringify(obj)); // attention: data loss: null values, dates stringified, no functions
    return clone(obj);
}

/* https://stackoverflow.com/questions/54733539/javascript-implementation-of-lodash-set-method
function set(obj, path, value) {
    if (Object(obj) !== obj) return obj; // When obj is not an object
    // If not yet an array, get the keys from the string-path
    if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || []; 
    path.slice(0,-1).reduce((a, c, i) => // Iterate all of them except the last one
         Object(a[c]) === a[c] // Does the key exist and is its value an object?
             // Yes: then follow that path
             ? a[c] 
             // No: create the key. Is the next key a potential array-index?
             : a[c] = Math.abs(path[i+1])>>0 === +path[i+1] 
                   ? [] // Yes: assign a new array object
                   : {}, // No: assign a new plain object
         obj)[path[path.length-1]] = value; // Finally assign the value to the last key
    return obj; // Return the top-level object to allow chaining}
}
*/
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

function omit(obj, pathes) {
    if (Object(obj) !== obj || !Array.isArray(pathes)) return obj; // When obj is not an object
    let cobj = cloneDeep(obj);
    for (let i = 0; i < pathes.length; i++) cobj = set(cobj, pathes[i], undefined);
    return cobj;
}

module.exports = {
    get,
    set,
    cloneDeep,
    omit
};
