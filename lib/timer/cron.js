/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 * 
 */
 "use strict";

const parser = require("cron-parser");

const InvalidCronError = new Error("Invalid cron expression");

class Cron {

    constructor(expression) {
        try {
            this.interval = parser.parseExpression(expression);
            this.expression = expression;
        } catch(err) {
            throw InvalidCronError;
        }
    }

    next(current) {
        if (!current) return this.interval.next().toDate();

        const options = { currentDate: current };
        try {
             const interval = parser.parseExpression(this.expression, options);
             return interval.next().toDate();
        } catch(err) {
            throw InvalidCronError;
        }

    }

}

module.exports = {
    Cron,
    InvalidCronError
}



