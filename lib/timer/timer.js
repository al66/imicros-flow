/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 * 
 */
 "use strict";

 const { Cron } = require("./cron");
 const { Cycle } = require("./cycle");

 const InvalidTimerError = new Error("Invalid timer");

 class Timer {

    constructor (timer) {

        this._timer = timer;
        if (timer?.cycle) {
            this.cycle = new Cycle(timer.cycle);
        }
        if (timer?.cron) {
            this.cron = new Cron(timer.cron);
            time = cron.next();
        }

    }

    get timer() {
        return this._timer;
    }

    next(current = null) {
        if (this.cycle) return this.cycle.next(current);
        if (this.cron) return this.cron.next(current);
        return null;
    }

 }

 module.exports = {
    Timer,
    InvalidTimerError
}
