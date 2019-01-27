/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const _ = require("lodash");

module.exports = (map, input) => {  

    if (map == ".") return input;
    
    let output = _.cloneDeep(map);

    let visitor = object => {
        if (typeof object === "object") {
            for (let property in object) {
                /* istanbul ignore else */
                if (object.hasOwnProperty(property)) {
                    if ((typeof object[property] === "object")) {
                        visitor(object[property]);
                    } else {
                        // try to replace by given object path
                        object[property] = _.get(input, object[property],object[property]);
                    }
                }
            }
        }
    };

    if (input) {
        visitor(output);
    }
    return output;
};