/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

class Constants {

    static get STATIC_GROUP() { return "flow"; }
    
    constructor (object) {
        Object.assign(this, object);
    }
}

module.exports = Constants;