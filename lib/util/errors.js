/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

class FlowError extends Error {
    constructor(e) {
        super(e);
        Error.captureStackTrace(this, this.constructor);
        this.message = e.message || e;
        this.name = this.constructor.name;
    }
}

class FlowSubscriptionFailedAuthorization extends FlowError {
    constructor(e, { subscription, content } = {}) {
        super(e);
        this.subscription = subscription;
        this.content = content;
    }
}
class FlowSubscriptionRuleNoMatch extends FlowError {
    constructor(e, { event, rule } = {}) {
        super(e);
        this.event = event;
        this.rule = rule;
    }
}

//class FlowMissingAccessGroups extends FlowError {}

module.exports = {
    FlowError,
    FlowSubscriptionFailedAuthorization,
    FlowSubscriptionRuleNoMatch
};
