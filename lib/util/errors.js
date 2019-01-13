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

class FlowPublishFailedAuthorization extends FlowError {
    constructor(e, { group, access } = {}) {
        super(e);
        this.group = group;
        this.access = access;
    }
}

class FlowPublishLostConnection extends FlowError {}


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

class FlowUnvalidTask extends FlowError {
    constructor(e, { task } = {}) {
        super(e);
        this.task = task;
    }
}

class FlowUnvalidEvent extends FlowError {
    constructor(e, { event } = {}) {
        super(e);
        this.event = event;
    }
}

class FlowUnvalidMapping extends FlowError {
    constructor(e, { map } = {}) {
        super(e);
        this.map = map;
    }
}

//class FlowMissingAccessGroups extends FlowError {}

module.exports = {
    FlowError,
    FlowPublishFailedAuthorization,
    FlowPublishLostConnection,
    FlowSubscriptionFailedAuthorization,
    FlowSubscriptionRuleNoMatch,
    FlowUnvalidTask,
    FlowUnvalidEvent,
    FlowUnvalidMapping
};
