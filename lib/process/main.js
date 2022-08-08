/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

const Constants = require("../util/constants");
const { map } = require("imicros-flow-map");
const { v4: uuid } = require("uuid");
const _ = require("../util/lodash");

class Factory {

    constructor ({ broker, db, services = {}, serviceId, serviceToken }) {
        // Moleculer service broker & logger
        this.broker = broker;
        this.logger = this.broker.logger;

        // db
        this.db = db;

        // services
        this.services = services;

        // agent credentials
        this.serviceId = serviceId;
        this.serviceToken = serviceToken;
    }

    async processToken ({ token }) {
        const element = await this.getElement({ token });
        return element.processToken({ token });
    }

    async completed({ token, result = null, error = null }) {
        const element = await this.getElement({ token });
        return element.completed({ token, result, error })
    }

    async getElement ({ token }) {
        // get group access opts
        let opts = await this.getOpts({ token });
        // get process instance
        let process = new Process({ factory: this, opts, processId: token.processId, versionId: token.versionId });
        // get element instance
        return process.getElement({ elementId: token.elementId });
    }

    async raiseEvent ({ eventName, payload, token, meta } ) {
        // get group access opts
        const opts = await this.getOpts({ token, meta });
        const trigger = {
            processId: token?.processId || meta?.flow?.processId,
            versionId: token?.versionId || meta?.flow?.versionId
        }

        // get subscriptions
        const subscriptions = await this.db.getSubscriptions({ opts, eventName});
        for (const subscription of subscriptions) {
            // get process instance
            const process = new Process({ factory: this, opts, processId: subscription.processId, versionId: subscription.versionId });
            // get element instance
            const element = await process.getElement({ elementId: subscription.elementId });
            // new instance ?
            if (element.data.position === Constants.INTERMEDIATE_EVENT) {
                // TODO get all active instances
                // TODO evaluate correlation condition for each active instance
                // TODO if true, save payload and emit token
            } else {
                const instanceId = await process.startInstance();

                // save payload to context
                await process.addToContext({ instanceId, key: element.data.attributes.output || eventName , value:payload });

                // build and emit token
                let token = {
                    processId: subscription.processId,
                    versionId: subscription.versionId,
                    instanceId,
                    elementId: element.data.id,
                    type: element.data.type,
                    status: element.getInitialStatus({ type: element.data.type }),
                    user: opts.user,
                    ownerId: opts.acl.ownerId,
                    attributes: {}
                };
                await process.logToken ({ emit: [token] });
            }

        };
    }

    async getOpts({ token = {}, meta = {} }) {
        const user = token?.user || meta?.user;
        const ownerId = token?.ownerId || meta?.acl?.ownerId
        let accessToken;
        const opts = {
            meta: {
                service: {
                    serviceId: this.serviceId,
                    serviceToken: this.serviceToken
                },
                user
            }
        };
        try {
            let res = await this.broker.call(this.services.agents + ".requestAccess", { ownerId }, opts);
            if (res && res.token) accessToken = res.token;
        } catch (err) {
            this.logger.error("Failed to retrieve access token", { token, meta });
        }
        return {
            service: {
                serviceId: this.serviceId,
                serviceToken: this.serviceToken
            },
            user,
            ownerId,
            acl: {
                accessToken,
                ownerId
            }
        };
    }

}

class Process {

    constructor ({ factory, opts, processId, versionId }) {
        // Moleculer service broker & logger
        this.broker = factory.broker;
        this.logger = this.broker.logger;

        // db
        this.db = factory.db;

        // services
        this.services = factory.services;

        // factory
        this.factory = factory;

        // group access
        this.opts = opts;

        // process and version id's
        this.processId = processId;
        this.versionId = versionId;
    }

    async startInstance() {
        const params = {
            opts: this.opts,
            processId: this.processId,
            versionId: this.versionId,
            instanceId: uuid()
        };
        await this.db.createInstance(params);
        this.broker.emit("flow.instance.created", {
            ownerId: this.opts.acl.ownerId,
            processId: params.processId,
            versionId: params.versionId,
            instanceId: params.instanceId
        }, this.opts );
        return params.instanceId;
    }
    
    async init() {

        if (!this.parsedData) {
            // parsed process
            const process = await this.db.getProcess({ opts: this.opts, processId: this.processId, versionId: this.versionId });
            this.parsedData = process?.parsedData;

            if (!this.parsedData) {
                this.logger.error("Process not found", { token: this.token });
                throw new Error("Process not found");
            }
        }
    }

    async getElement({ elementId }) {
        // get process
        await this.init();
        // search in sequences
        let element = this.parsedData.sequence.find(sequence => sequence.id === elementId);
        if (element) return new Sequence({ process: this, element});
        // search in tasks
        element = this.parsedData.task.find(task => task.id === elementId);
        if (element) return new Activity({ process: this, element})
        // search in events
        element = this.parsedData.event.find(event => event.id === elementId);
        if (element) return new Event({ process: this, element})
        // search in gateways
        element = this.parsedData.gateway.find(gateway => gateway.id === elementId);
        if (element) return new Gateway({ process: this, element})

        this.logger.error("Element not found", { processId: this.processId, versionId: this.versionId, elementId });
        throw new Error("Element not found");
    }
 
    async getNext({ elementId }) {
        // get process
        await this.init();

        let next = [];
        // search in sequences
        let element = this.parsedData.sequence.find(sequence => sequence.id === elementId);
        // search in tasks
        if (!element) element = this.parsedData.task.find(task => task.id === elementId);
        // search in events
        if (!element) element = this.parsedData.event.find(event => event.id === elementId);
        // TODO search in gateways

        // sequence
        if (element.type === Constants.SEQUENCE_STANDARD) {
            if (element.toId) next.push(element.toId);
        // task, event or gateway
        } else {
            if (Array.isArray(element.outgoing)) next = next.concat(element.outgoing);
        };

        // map id to element
        next = next.map(id => {
            // search in sequences
            let element = this.parsedData.sequence.find(sequence => sequence.id === id);
            // search in tasks
            if (!element) element = this.parsedData.task.find(task => task.id === id);
            // search in events
            if (!element) element = this.parsedData.event.find(event => event.id === id);
            // TODO search in gateways

            return element;
        });

        return next;
    }

    async addToContext({ instanceId, key, value }) {
        return this.db.addContextKey ({ opts: this.opts, instanceId, key, value });
    }

    async getContextKeys({ instanceId, keys }) {
        return this.db.getContextKeys({ opts: this.opts, instanceId, keys });
    }

    async getContextKey({ instanceId, key }) {
        return this.db.getContextKey({ opts: this.opts, instanceId, key });
    }

    async logToken({ consume = [], emit = [] }) {
        // get instanceId from any token
        let instanceId = consume?.length > 0 ? consume[0].instanceId : (emit?.length > 0 ? emit[0].instanceId : null );
        if (!instanceId) {
            this.logger.error("logToken without token called");
            throw new Error("logToken without token called");
        }
        await this.db.logToken ({ opts: this.opts, instanceId, consume, emit });
        
        // emit events
        if (Array.isArray(consume)) await Promise.all(consume.map(async (token) => {
            return this.broker.emit("flow.token.consume", { token });
        }));
        if (Array.isArray(emit)) await Promise.all(emit.map(async (token) => {
            return this.broker.emit("flow.token.emit", { token });
        }));
    }


    async checkCompleted({ token }) {
        const info = await this.db.getToken ({ opts: this.opts, instanceId: token.instanceId })
        this.logger.debug("check completed", { token, info });
        // no active tokens -> instance is completed
        if (info?.active?.length === 0) {
            this.logger.debug("instance completed", { instanceId: token.instanceId });
            await this.db.updateInstance ({ opts: this.opts, processId: token.processId, versionId: token.versionId, instanceId: token.instanceId, completed: true });
            await this.broker.emit("flow.instance.completed", {
                ownerId: this.opts.acl.ownerId,
                processId: token.processId,
                versionId: token.versionId,
                instanceId: token.instanceId
            }, this.opts );
            }
    }

}

class Element {

    constructor ({ process, element }) {
        // process instance
        this.process = process;

        // Moleculer service broker & logger
        this.broker = process.broker;
        this.logger = this.broker.logger;

        // db
        this.db = process.db;

        // services
        this.services = process.services;

        // group access
        this.opts = process.opts;

        // element
        this.data = element;
    }

    async processToken({ token }) {
        // store current processed token for access by subroutines
        this.token = token;
    }

    async completed({ token }) {
        // store current processed token for access by subroutines
        this.token = token;
    }

    getInitialStatus({ type }) {
        let status;
        switch ( type ) {
            // event
            case Constants.DEFAULT_EVENT:
            case Constants.MESSAGE_EVENT:
            case Constants.TIMER_EVENT:
            case Constants.ESCALATION_EVENT:
            case Constants.CONDITIONAL_EVENT:
            case Constants.ERROR_EVENT:
            case Constants.CANCEL_EVENT:
            case Constants.COMPENSATION_EVENT:
            case Constants.SIGNAL_EVENT:
            case Constants.MULTIPLE_EVENT:
            case Constants.PARALLEL_MULTIPLE_EVENT:
            case Constants.TERMINATE_EVENT:
                status = Constants.EVENT_ACTIVATED;
                break;
            // task
            case Constants.SEND_TASK:
            case Constants.RECEIVE_TASK:
            case Constants.USER_TASK:
            case Constants.MANUAL_TASK:
            case Constants.BUSINESS_RULE_TASK:
            case Constants.SERVICE_TASK:
            case Constants.SCRIPT_TASK:
                status = Constants.ACTIVITY_ACTIVATED;
                break;
            // sequence
            case Constants.SEQUENCE_STANDARD:
            case Constants.SEQUENCE_CONDITIONAL:
            case Constants.SEQUENCE_DEFAULT:
                status = Constants.SEQUENCE_ACTIVATED;
                break;
            // gateway
            case Constants.EXCLUSIVE_GATEWAY:
            case Constants.EVENT_BASED_GATEWAY:
            case Constants.PARALLEL_GATEWAY:
            case Constants.INCLUSIVE_GATEWAY:
            case Constants.EXCLUSIVE_EVENT_BASED_GATEWAY:
            case Constants.PARALLEL_EVENT_BASED_GATEWAY:
                status = Constants.GATEWAY_ACTIVATED;
                break;
        }
        if (!status) this.logger.error("Missing status for token type", { type: type });
        return status;
    }   
    
    setNewStatus({ token, status }) {
        let newToken = _.cloneDeep(token);
        newToken.status = status;
        return newToken;
    }

    async activateNext() {
        this.logger.debug("get next", { token: this.token });

        // get next steps
        let next =  await this.process.getNext({ elementId: this.token.elementId });
        let newTokens = [];
        
        this.logger.debug("Activate next", { token: this.token, next });
        if ( Array.isArray(next) ) {
            // contains a default sequence ?
            let defaultSequence;
            for(const element of next ) {
                if (element.type === Constants.SEQUENCE_DEFAULT) {
                    defaultSequence = element;
                    break;
                }
            }
            for(const element of next ) {
                // build new token
                let newToken = {
                    processId: this.token.processId,
                    versionId: this.token.versionId,
                    instanceId: this.token.instanceId,
                    elementId: element.id,
                    type: element.type,
                    status: this.getInitialStatus({ type: element.type }),
                    user: this.token.user,
                    ownerId: this.token.ownerId,
                    attributes: {
                        lastElementId: this.token.elementId
                    }
                };
                // note default sequence to be notified, after conditional sequence is evaluated
                if (defaultSequence) {
                    newToken.attributes = {
                        defaultSequence: defaultSequence.uid,
                        waitFor: next.filter(e => e.type !== Constants.SEQUENCE_DEFAULT && e.uid !== element.uid)
                    };
                }
                newTokens.push(newToken);
            }
        }
        await this.process.logToken ({ consume: [this.token], emit: newTokens });
        if ( !Array.isArray(next) || next.length < 1 ) {
            // no more elements -> check, if instance is completed
            await this.process.checkCompleted({ token: this.token });
        }
        return true;
    }

}

class Event extends Element {

    async processToken({ token = {} }) {
        // common element processing
        super.processToken({ token });

        switch ( token.status ) {
            case Constants.EVENT_ACTIVATED:
                await this.prepareEvent();
                break;
            case Constants.EVENT_READY:
                await this.processEvent();
                break;
            case Constants.EVENT_OCCURED:
                // activate next
                await this.activateNext();
                break;
            default:
                // ignore token
        }           

        return true;
    }

    async processEvent() {
        // handle throwing events
        this.handleThrowing();

        // TODO handle terminating events

        // TODO handle catching events

        // consume token and emit next token with status "event occured" 
        let newToken = this.setNewStatus({ token: this.token, status: Constants.EVENT_OCCURED })
        await this.process.logToken ({ consume: [this.token], emit: [newToken] });
        return true;
    }

    async prepareEvent() {

        // consume token and emit next token with status "event ready" 
        let newToken = this.setNewStatus({ token: this.token, status: Constants.EVENT_READY })
        await this.process.logToken ({ consume: [this.token], emit: [newToken] });
        return true;
    }   

    async handleThrowing() {
        if (this.data.direction !== Constants.THROWING_EVENT) return;
        this.logger.debug("throw event", {event: this.data, token: this.token});
        let payload = {};
        // evaluate preparation function
        const language = this.data?.attributes?.preparation?.template?.langauge ?? null;
        if (language) {
            if (!["JSONata"].includes(language)) {
                // log error in context
                await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { event: this.data, error: "Not supported template language" }});
                // consume token and emit next token with status "process error" 
                let newToken = this.setNewStatus({ token: this.token, status: Constants.PROCESS_ERROR })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                return false;
            }
            try {
                // get keys
                let inKeys = this.data?.attributes?.preparation?.input ?? [];
                if (inKeys && !Array.isArray(inKeys)) inKeys = inKeys.split(",");
                let outKey = this.data?.attributes?.output || this.token.elementId;
                // get context
                let context = await this.process.getContextKeys({ instanceId: this.token.instanceId, keys: inKeys });
                // prepare payload
                let template;
                switch (language) {
                    case "JSONata":
                        {
                            template = this.data?.attributes?.template?.body ?? null;
                            payload = await map(template,context);
                            this.logger.debug("Template rendered", { inKeys, context, result });
                        }
                        break;
                    // currently no further preparation functions available
                }
            } catch (err) {
                this.logger.debug("Execution of preparation failed", { error: err });
                // log error in context
                await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { event: this.data, error: "Execution of preparation failed" }});
                // consume token and emit next token with status "activity error" 
                let newToken = this.setNewStatus({ token: this.token, status: Constants.PROCESS_ERROR })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                return false;
            }
        }
        // raise event
        switch(this.data.type) {
            case Constants.MESSAGE_EVENT:
                // TODO
                break;
            default: 
                await this.process.factory.raiseEvent({ eventName: this.data.attributes?.name || this.data.name, payload, token: this.token } );
            }
    }
}

class Activity extends Element {

    async processToken({ token }) {
        // common element processing
        super.processToken({ token });

        switch ( token.status ) {
            case Constants.ACTIVITY_ACTIVATED:
                // get activity attributes and evaluate start conditions
                // if start conditions evaluate w/o errors emit ready token
                await this.prepareActivity();
                break;
            case Constants.ACTIVITY_READY:
                // get activity attributes and execute activity
                // if executed w/o errors emit completed token
                await this.startActivity();
                break;
            case Constants.ACTIVITY_ERROR:
                // stop instance

                break;
            case Constants.ACTIVITY_COMPLETED:
                // activate next
                await this.activateNext({ token });
                break;
            default:
                // ignore token
        }           

        return true;
    }

    async completed({ token, result = null, error = null }) {
        // common element processing
        super.completed({ token });

        if (result) {
            // save result to context
            const output = this.data?.attributes?.output ?? this.token.elementId;
            await this.process.addToContext({ instanceId: this.token.instanceId, key: output, value:result });
            // consume token and emit next token with status "activity completed" 
            const newToken = this.setNewStatus({ token: this.token, status: Constants.ACTIVITY_COMPLETED })
            await this.process.logToken ({ consume: [this.token], emit: [newToken] });
            return true;
        }
        if (error) {
            // log error in context
            await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { activity: this.data, error: "Execution of task failed" }});
            // consume token and emit next token with status "activity error" 
            let newToken = this.setNewStatus({ token: this.token, status: Constants.ACTIVITY_ERROR })
            await this.process.logToken ({ consume: [this.token], emit: [newToken] });
            return true;
        }
    }

    async prepareActivity() {
        this.logger.debug("prepare activity", {activity: this.data, token: this.token});
        // evaluate preparation function
        const language = this.data?.attributes?.preparation?.template?.language ?? null;
        if (language) {
            if (!["JSONata"].includes(language)) {
                // log error in context
                await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { event: this.data, error: "Not supported template language" }});
                // consume token and emit next token with status "process error" 
                let newToken = this.setNewStatus({ token: this.token, status: Constants.PROCESS_ERROR })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                return false;
            }
            try {
                // get keys
                let inKeys = this.data?.attributes?.preparation?.input ?? [];
                if (inKeys && !Array.isArray(inKeys)) inKeys = inKeys.split(",");
                let params = this.data?.attributes?.input || this.token.elementId;
                // get context
                let context = await this.process.getContextKeys({ instanceId: this.token.instanceId, keys: inKeys }); 
                // prepare payload
                let template;
                let result = {};
                switch (language) {
                    case "JSONata":
                        {
                            template = this.data?.attributes?.preparation?.template?.body ?? "";
                            result = await map(template,context);
                            this.logger.debug("Template rendered", { inKeys, context, result });
                        }
                        break;
                    // currently no further preparation functions available
                }
                // save result to context
                await this.process.addToContext({ instanceId: this.token.instanceId, key: params, value:result });
            } catch (err) {
                this.logger.debug("Execution of preparation failed", { error: err });
                // log error in context
                await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { event: this.data, error: "Execution of preparation failed" }});
                // consume token and emit next token with status "activity error" 
                let newToken = this.setNewStatus({ token: this.token, status: Constants.PROCESS_ERROR })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                return false;
            }
        }
        // consume token and emit next token with status "activity ready" 
        let newToken = this.setNewStatus({ token: this.token, status: Constants.ACTIVITY_READY })
        await this.process.logToken ({ consume: [this.token], emit: [newToken] });
        return true;
    }   
    
    async startActivity() {
        this.logger.debug("start activity", {activity: this.data, token: this.token});

        switch (this.data.type) {
            case Constants.SERVICE_TASK:
                return this.startServiceTask();
            case Constants.BUSINESS_RULE_TASK:
                return this.startBusinessRuleTask();
            default:
                // consume token and emit next token with status "activity completed" 
                let newToken = this.setNewStatus({ token: this.token, status: Constants.ACTIVITY_COMPLETED })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                return true;
        }
    }

    async startServiceTask() {
        this.logger.debug("execute service task", { activity: this.data, token: this.token });

        let action = this.data?.attributes?.action ?? null;
        let serviceId = this.data?.attributes?.serviceId ?? null;
        if (action) {
            try {
                const input = this.data?.attributes?.input ?? "";
                // get parameter
                const params = await this.process.getContextKey({ instanceId: this.token.instanceId, key: input }); 
                // call action
                const result = await this.process.broker.call(action, params, { meta: this.opts });
                // save result to context
                const output = this.data?.attributes?.output ?? this.token.elementId;
                await this.process.addToContext({ instanceId: this.token.instanceId, key: output, value:result });
                // consume token and emit next token with status "activity completed" 
                const newToken = this.setNewStatus({ token: this.token, status: Constants.ACTIVITY_COMPLETED })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                return true;
            } catch (err) {
                this.logger.info("Execution of service task failed", { error: err });
                // log error in context
                await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { activity: this.data, error: "Execution of service task failed" }});
                // consume token and emit next token with status "activity error" 
                let newToken = this.setNewStatus({ token: this.token, status: Constants.ACTIVITY_ERROR })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                return false;
            }
        } else if (serviceId) {
            try {
                const input = this.data?.attributes?.input ?? "";
                // get context
                const value = await this.process.getContextKey({ instanceId: this.token.instanceId, key: input }); 
                let result = await this.broker.call(this.services.queue + ".add", { serviceId, value, token }, { meta: this.opts });
                if ( !result ) throw new Error("Failed to queue task for agent");
                return true;
            } catch (err) {
                this.logger.info("Execution of service task failed", { error: err });
                // log error in context
                await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { activity: this.data, error: "Execution of service task failed" }});
                // consume token and emit next token with status "activity error" 
                let newToken = this.setNewStatus({ token: this.token, status: Constants.ACTIVITY_ERROR })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                return false;
            }
        }

    }

    async startBusinessRuleTask() {
        this.logger.debug("execute business rule", { activity: this.data, token: this.token });

        // evaluate decision
        try {
            // get keys
            let input = this.data?.attributes?.input ?? [];
            if (input && !Array.isArray(input)) input = input.split(",");
            let output = this.data?.attributes?.output || this.token.elementId;
            // get context
            let context = await this.process.getContextKeys({ instanceId: this.token.instanceId, keys: input });
            let expression = {
                objectName: this.data.attributes?.object?.objectName
            }
            // evaluate
            let result = await this.process.broker.call(this.services.feel + ".evaluate", { expression, context }, { meta: this.opts });
            // save result to context
            await this.process.addToContext({ instanceId: this.token.instanceId, key: output, value:result });
        } catch (err) {
            this.logger.debug("Execution of business rule task failed", { error: err });
            // log error in context
            await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { activity: this.data, error: "Execution of business rule task failed" }});
            // consume token and emit next token with status "activity error" 
            let newToken = this.setNewStatus({ token: this.token, status: Constants.ACTIVITY_ERROR })
            await this.process.logToken ({ consume: [this.token], emit: [newToken] });
            return false;
        }

        // consume token and emit next token with status "activity completed" 
        let newToken = this.setNewStatus({ token: this.token, status: Constants.ACTIVITY_COMPLETED })
        await this.process.logToken ({ consume: [this.token], emit: [newToken] });
        return true;

    }

};

class Sequence extends Element {

    async processToken({ token }) {
        // common element processing
        super.processToken({ token });

        switch ( token.status ) {
            case Constants.SEQUENCE_ACTIVATED:
                await this.sequenceAcvtivated({ token });
                break;
        case Constants.SEQUENCE_COMPLETED:
                // activate next
                await this.activateNext({ token });
                break;
            default:
                // ignore token
        }           

        return true;
    }

    async sequenceAcvtivated({ token }) {
        switch ( this.data.type ) {
            // start
            case Constants.SEQUENCE_STANDARD:
                // just passed trough - consume token and emit next token with status "activity completed" 
                let newToken = this.setNewStatus({ token, status: Constants.SEQUENCE_COMPLETED })
                await this.process.logToken ({ consume: [token], emit: [newToken] });
                break;
            case Constants.SEQUENCE_DEFAULT:
                // TODO
                // default sequence will be activated by evaluation of the other outgoing sequences
                break;
            case Constants.SEQUENCE_CONDITIONAL:
                // TODO
                // await this.evaluateSequence({ token, sequence, opts });
                break;
        }
        
        return true;
    }
};

class Gateway extends Element {

    async processToken({ token }) {
        // common element processing
        super.processToken({ token });

        switch ( token.status ) {
            case Constants.GATEWAY_COMPLETED:
                // activate next
                await this.activateNext({ token });
                break;
            default:
                // ignore token
        }           

        return true;
    }

};

module.exports = {
    Factory,
    Event,
    Activity,
    Sequence,
    Gateway
};
