/**
 * @license MIT, imicros.de (c) 2020 Andreas Leinen
 */
"use strict";

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

function cloneDeep(obj) {
    return Object.assign({}, obj);
}

module.exports = {
    get: getValue,
    cloneDeep: cloneDeep
};
