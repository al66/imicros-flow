/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 * 
 * Based on:
 * https://github.com/MelleB/tinyduration
 * 
 */
 "use strict";

const InvalidCycleError = new Error("Invalid cycle");

function parseNum(s) {
    if (s === '' || s === undefined || s === null) {
        return undefined
    }
    return parseFloat(s.replace(',', '.'))
}

class Cycle {

    constructor(cycle) {

        const regexPeriod = [
            "((?<years>\\d*[\\.,]?\\d+)Y)?",
            "((?<months>\\d*[\\.,]?\\d+)M)?",
            "((?<weeks>\\d*[\\.,]?\\d+)W)?",
            "((?<days>\\d*[\\.,]?\\d+)D)?",
            "(T",
            "((?<hours>\\d*[\\.,]?\\d+)H)?",
            "((?<minutes>\\d*[\\.,]?\\d+)M)?",
            "((?<seconds>\\d*[\\.,]?\\d+)S)?",
            ")?"                // optional time
        ].join('')

        const regexTime = [
            "(?<hour>2[0-3]|[01][0-9]):?",
            "(?<minute>[0-5][0-9]):?",
            "(?<second>[0-5][0-9])",
            "(?<timezone>Z|(?<offset_sign>[+-])(?:(?<offset_hours>2[0-3]|[01][0-9]))(?::?(?:(?<offset_minutes>[0-5][0-9])))?)"
        ].join('')

        // R<count> optional / <start date time> required / P<period> optional
        const regex = new RegExp(
            [
                '(^(?<repeat>R)(?<count>\\d*[\\.,]?\\d+)?)?/?',
                '((?<year>[0-9]{4})-?(?<month>1[0-2]|0[1-9])?-?(?<day>3[01]|0[1-9]|[12][0-9]))?',  // date - hyphens are optional
                `(T${regexTime})?`,                                                                // time - colons are optional
                '/?',   
                `(P${regexPeriod})?`
            ].join('')
        )

        const doNotParse = [
            "repeat",
            "timezone",
            "offset_sign"
        ]

        const match = regex.exec(cycle)
        if (!match || !match.groups) {
            throw InvalidCycleError
        }

        this._value = {};
        for (const group in match.groups) {
            if (match.groups[group]) {
                if (doNotParse.includes(group)) {
                    this._value[group] = match.groups[group]
                } else {
                    this._value[group] = parseNum(match.groups[group])
                }
            }
        }
    }

    get value() {
        return this._value;
    }

    get date() {
        let date =  new Date(Date.UTC(this._value.year, this._value.month > 0? this._value.month - 1 : 0, this._value.day, this._value.hour || 0, this._value.minute || 0, this._value.second || 0));
        let sign = this._value?.offset_sign === "-" ? 1 : -1;
        let offset = {
            hours: this._value?.offset_hours ? this._value?.offset_hours * sign : 0,
            minutes:  this._value?.offset_minutes ? this._value?.offset_minutes * sign : 0
        }
        date.setHours(date.getHours()+(offset.hours));
        date.setMinutes(date.getMinutes()+(offset.minutes));
        return date;
    }

    next(current) {
        if(!current) return this.date;
        if(!this._value.repeat) return null;
        let next = current;
        next.setFullYear(next.getFullYear()+(this._value?.years || 0))
        next.setMonth(next.getMonth()+(this._value?.months || 0))
        next.setDate(next.getDate()+(this._value?.weeks ? this._value?.weeks * 7 : 0))
        next.setDate(next.getDate()+(this._value?.days || 0))
        next.setHours(next.getHours()+(this._value?.hours || 0))
        next.setMinutes(next.getMinutes()+(this._value?.minutes || 0))
        next.setSeconds(next.getSeconds()+(this._value?.seconds || 0))
        return new Date(next);
    }

}

module.exports = {
    Cycle,
    InvalidCycleError
}

