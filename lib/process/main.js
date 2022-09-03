/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

const { Parser } = require("../parser/basic");
const Constants = require("../util/constants");
const { map } = require("imicros-flow-map");
const { v4: uuid } = require("uuid");
const _ = require("../util/lodash");

const { Timer } = require("../timer/timer");

class Context {

    set ({ broker, db, services = {}, serviceId, serviceToken }) {
        // Moleculer service broker & logger
        this._broker = broker;

        // db
        this._db = db;

        // services
        this._services = services;

        // agent credentials
        this._serviceId = serviceId;
        this._serviceToken = serviceToken;
    }

    get db() { return this._db };
    get broker() { return this._broker };
    get logger() { return this._broker.logger };
    get services() { return this._services };
    get serviceId() { return this._serviceId };
    get serviceToken() { return this._serviceToken };

}

const context = new Context();

class DeploymentManager {

    async deployProcess({ xmlData, objectName, meta }) {
        const parser = new Parser({ broker: context.broker });
        const ownerId = this.getOwner({ meta });
        try {
            const id = uuid();
            const parsedData = parser.parse({id, xmlData, objectName, ownerId });
            const result = await context.db.saveProcess({
                opts: meta,
                xmlData,
                parsedData
            });
            return result;
        } catch(err) {
            // TODO
        }
    }

    async activateVersion({ processId, versionId, meta }) {
        return await context.db.activateVersion({ opts: meta, processId, versionId })
    }

    async getProcess({ processId, versionId, xml, meta }) {
        const result = await context.db.getProcess({
            opts: meta,
            processId,
            versionId,
            xml
        });
        return result;
    }

    async getOwner({ meta = {} }) {
        return meta?.acl?.ownerId;
    }

}
class Factory {

    get db() { return context.db };
    get broker() { return context.broker };
    get logger() { return context.logger };
    get services() { return context.services };
    get serviceId() { return context.serviceId };
    get serviceToken() { return context.serviceToken };

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

        // return array of triggered instances
        const returnValue = [];

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

                returnValue.push({ processId: token.processId, versionId: token.versionId, instanceId });
            }

        };
        return returnValue;
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
        // factory
        this.factory = factory;

        // group access
        this.opts = opts;

        // process and version id's
        this.processId = processId;
        this.versionId = versionId;
    }

    get db() { return context.db };
    get broker() { return context.broker };
    get logger() { return context.logger };
    get services() { return context.services };

    // In case of a time restart event the instance uuid will be already set when creating the token
    async startInstance({ instanceId = null } = {}) {
        const params = {
            opts: this.opts,
            processId: this.processId,
            versionId: this.versionId,
            instanceId: instanceId || uuid()
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
 
    async evaluate({ expression, context }) {
        // evaluate
        const result = await this.broker.call(this.services.feel + ".evaluate", { expression, context }, { meta: this.opts });
        return result;
    }

    async transform({ template, input, token }) {
        if (!template || !input) return {};
        try {
            // get template language
            const language = template?.language ?? null;
            // check language
            if (!["JSONata"].includes(language)) throw new Error(`Language ${language} not supported`)
            // get context
            const context = await this.getContextKeys({ instanceId: token.instanceId, input }); 
            // prepare payload
            let result = {};
            switch (language) {
                case "JSONata":
                    {
                        result = await map(template?.body ?? "",context);
                        this.logger.debug("Template rendered", { context, result });
                    }
                    break;
                // currently no further preparation functions available
            }
            return { result };
        } catch (err) {
            this.logger.debug("Execution of preparation failed", { error: err });
            throw err;
        }
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
        // search in gateways
        if (!element) element = this.parsedData.gateway.find(event => event.id === elementId);
        // TODO: sub process, call activity, transaction

        // sequence
        if (element.type === Constants.SEQUENCE_STANDARD || element.type === Constants.SEQUENCE_CONDITIONAL ) {
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
            // search in gateways
            if (!element) element = this.parsedData.gateway.find(event => event.id === id);
            // TODO: sub process, call activity, transaction

            return element;
        });

        return next;
    }

    async addToContext({ instanceId, key, value }) {
        return this.db.addContextKey ({ opts: this.opts, instanceId, key, value });
    }

    async getContextKeys({ instanceId, keys = null, input = null }) {
        if (input) {
            keys = input || [];
            if (keys && !Array.isArray(keys)) keys = keys.split(",");
        }
        // get context
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
        if (Array.isArray(consume)) consume.forEach((token) => this.broker.emit("flow.token.consume", { token }));
        if (Array.isArray(emit)) emit.forEach((token) => this.broker.emit("flow.token.emit", { token }));
        /*
        if (Array.isArray(consume)) await Promise.all(consume.map(async (token) => {
            return this.broker.emit("flow.token.consume", { token });
        }));
        if (Array.isArray(emit)) await Promise.all(emit.map(async (token) => {
            return this.broker.emit("flow.token.emit", { token });
        }));
        */
    }

    async getActiveToken({ instanceId }) {
        const result = await this.db.getToken ({ opts: this.opts, instanceId });
        return result.active;
    }

    async scheduleToken({ time, timer, token }) {
        return this.db.scheduleToken({ time, timer, token });
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
    
    setNewStatus({ status }) {
        let newToken = _.cloneDeep(this.token);
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
                        lastToken: this.token
                    }
                };
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

        // handle timer start event - schedule next time
        this.handleStartTimer();

        // TODO handle terminating events

        // TODO handle catching events

        // consume token and emit next token with status "event occured" 
        let newToken = this.setNewStatus({ status: Constants.EVENT_OCCURED });
        // clean up internally used attributes
        newToken = _.omit(newToken,"attributes.time");
        await this.process.logToken ({ consume: [this.token], emit: [newToken] });
        return true;
    }

    async prepareEvent() {
        // consume token and emit next token with status "event ready" 
        let newToken = this.setNewStatus({ status: Constants.EVENT_READY })
        await this.process.logToken ({ consume: [this.token], emit: [newToken] });
        return true;
    }   

    async handleStartTimer() {
        if (this.data.position === Constants.START_EVENT && this.data.type === Constants.TIMER_EVENT && this.data.attributes?.timer && this.token?.attributes?.time) {
            const timer = new Timer(this.data.attributes.timer);
            const time = timer.next(new Date(this.token.attributes.time));

            // token is not encrypted! Do not add critical information...
            const token = {
                processId: this.token.processId,
                versionId: this.token.versionId,
                instanceId: uuid(),
                elementId: this.data.id,
                type: this.data.type,
                status: Constants.EVENT_ACTIVATED,
                // ... user id should be ok
                user: this.token.user,
                ownerId: this.token.ownerId,
                attributes: {
                    time
                }
            };

            await this.process.scheduleToken({ time, timer: this.data.attributes.timer, token });
        }
    }

    async handleThrowing() {
        if (this.data.direction !== Constants.THROWING_EVENT) return;
        this.logger.debug("throw event", {event: this.data, token: this.token});
        let payload = {};
        // evaluate preparation
        try {
            // use template to prepare payload
            const transform = await this.process.transform({ template: this.data?.attributes?.preparation?.template, input: this.data?.attributes?.preparation?.input, token: this.token });
            // save result to context
            if (transform.result) payload = transform.result;
        } catch (err) {
            this.logger.debug("Execution of preparation failed", { error: err });
            // log error in context
            await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { event: this.data, error: "Execution of preparation failed" }});
            // consume token and emit next token with status "activity error" 
            let newToken = this.setNewStatus({ status: Constants.PROCESS_ERROR })
            await this.process.logToken ({ consume: [this.token], emit: [newToken] });
            return false;
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
                await this.activateNext();
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
            const newToken = this.setNewStatus({ status: Constants.ACTIVITY_COMPLETED })
            await this.process.logToken ({ consume: [this.token], emit: [newToken] });
            return true;
        }
        if (error) {
            // log error in context
            await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { activity: this.data, error: "Execution of task failed" }});
            // consume token and emit next token with status "activity error" 
            let newToken = this.setNewStatus({ status: Constants.ACTIVITY_ERROR })
            await this.process.logToken ({ consume: [this.token], emit: [newToken] });
            return true;
        }
    }

    async prepareActivity() {
        this.logger.debug("prepare activity", {activity: this.data, token: this.token});
        // evaluate preparation
        try {
            // use template to prepare parameters
            const transform = await this.process.transform({ template: this.data?.attributes?.preparation?.template, input: this.data?.attributes?.preparation?.input, token: this.token });
            // save result to context
            if (transform.result) await this.process.addToContext({ instanceId: this.token.instanceId, key: this.data?.attributes?.input || this.token.elementId, value:transform.result });
        } catch (err) {
            this.logger.debug("Execution of preparation failed", { error: err });
            // log error in context
            await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { event: this.data, error: "Execution of preparation failed" }});
            // consume token and emit next token with status "activity error" 
            let newToken = this.setNewStatus({ status: Constants.PROCESS_ERROR })
            await this.process.logToken ({ consume: [this.token], emit: [newToken] });
            return false;
        }
        // consume token and emit next token with status "activity ready" 
        let newToken = this.setNewStatus({ status: Constants.ACTIVITY_READY })
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
                let newToken = this.setNewStatus({ status: Constants.ACTIVITY_COMPLETED })
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
                // get parameter
                const input = this.data?.attributes?.input ?? "";
                const params = await this.process.getContextKey({ instanceId: this.token.instanceId, key: input }); 
                // call action
                const result = await this.process.broker.call(action, params, { meta: this.opts });
                // save result to context
                const output = this.data?.attributes?.output ?? this.token.elementId;
                await this.process.addToContext({ instanceId: this.token.instanceId, key: output, value:result });
                // consume token and emit next token with status "activity completed" 
                const newToken = this.setNewStatus({ status: Constants.ACTIVITY_COMPLETED })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                return true;
            } catch (err) {
                this.logger.info("Execution of service task failed", { error: err });
                // log error in context
                await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { activity: this.data, error: "Execution of service task failed" }});
                // consume token and emit next token with status "activity error" 
                let newToken = this.setNewStatus({ status: Constants.ACTIVITY_ERROR })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                return false;
            }
        } else if (serviceId) {
            try {
                // get context
                const input = this.data?.attributes?.input ?? "";
                const value = await this.process.getContextKey({ instanceId: this.token.instanceId, key: input }); 
                let result = await this.broker.call(this.services.queue + ".add", { serviceId, value, token: this.token }, { meta: this.opts });
                if ( !result ) throw new Error("Failed to queue task for agent");
                return true;
            } catch (err) {
                this.logger.info("Execution of service task failed", { error: err });
                // log error in context
                await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { activity: this.data, error: "Execution of service task failed" }});
                // consume token and emit next token with status "activity error" 
                let newToken = this.setNewStatus({ status: Constants.ACTIVITY_ERROR })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                return false;
            }
        }

    }

    async startBusinessRuleTask() {
        this.logger.debug("execute business rule", { activity: this.data, token: this.token });

        // evaluate decision
        try {
            // get context
            let context = await this.process.getContextKeys({ instanceId: this.token.instanceId, input: this.data?.attributes?.input });
            // evaluate
            const expression = this.data.attributes?.expression?.body || this.data.attributes?.object;
            let result = await this.process.evaluate({ expression, context });
            // save result to context
            let output = this.data?.attributes?.output || this.token.elementId;
            await this.process.addToContext({ instanceId: this.token.instanceId, key: output, value:result });
        } catch (err) {
            this.logger.debug("Execution of business rule task failed", { error: err });
            // log error in context
            await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { activity: this.data, error: "Execution of business rule task failed" }});
            // consume token and emit next token with status "activity error" 
            let newToken = this.setNewStatus({ status: Constants.ACTIVITY_ERROR })
            await this.process.logToken ({ consume: [this.token], emit: [newToken] });
            return false;
        }

        // consume token and emit next token with status "activity completed" 
        let newToken = this.setNewStatus({ status: Constants.ACTIVITY_COMPLETED })
        await this.process.logToken ({ consume: [this.token], emit: [newToken] });
        return true;

    }

    async activateNext() {
        this.logger.debug("get next", { token: this.token });

        // get next steps
        let next =  await this.process.getNext({ elementId: this.token.elementId });
        let newTokens = [];
        
        const valid = [];
        const def = [];

        this.logger.debug("Activate next", { token: this.token, next });
        if ( Array.isArray(next) ) {
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
                        lastToken: this.token
                    }
                };

                // check condition
                if (element.attributes?.expression) {
                    try {
                        // get context
                        const context = await this.process.getContextKeys({ instanceId: this.token.instanceId, input: element.attributes?.input });
                        // evaluate
                        const expression = element.attributes?.expression?.body || element.attributes?.object;
                        const result = await this.process.evaluate({ expression, context });
                        if (result === true) valid.push(newToken);
                    } catch (err) {
                        this.logger.debug("Execution of condition failed", { error: err });
                        // log error in context
                        await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { element, error: "Execution of condition failed" }});
                        // consume token and emit next token with status "process error" 
                        const newToken = this.setNewStatus({ status: Constants.PROCESS_ERROR })
                        await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                        return false;
                    }
                } else {
                    valid.push(newToken);
                }

                // is default?
                if (element.id === this.data.default) def.push(newToken);

            }
        }

        // all valid or the default
        if (valid.length > 0) {
            newTokens.push(...valid);
        } else if (def.length > 0) {
            newTokens.push(...def);
        }

        await this.process.logToken ({ consume: [this.token], emit: newTokens });
        if ( !Array.isArray(next) || next.length < 1 || newTokens.length < 1 ) {
            // no more elements -> check, if instance is completed
            await this.process.checkCompleted({ token: this.token });
        }
        return true;
    }    
};

class Sequence extends Element {

    async processToken({ token }) {
        // common element processing
        super.processToken({ token });

        switch ( token.status ) {
            case Constants.SEQUENCE_ACTIVATED:
                await this.sequenceAcvtivated();
                break;
        case Constants.SEQUENCE_COMPLETED:
                // activate next
                await this.activateNext();
                break;
            default:
                // ignore token
        }           

        return true;
    }

    async sequenceAcvtivated() {
        // nothing to do, but kept for future extensions

        // just passed trough - consume token and emit next token 
        let newToken = this.setNewStatus({ status: Constants.SEQUENCE_COMPLETED })
        await this.process.logToken ({ consume: [this.token], emit: [newToken] });

        return true;
    }
};

class Gateway extends Element {

    async processToken({ token }) {
        // common element processing
        super.processToken({ token });

        switch ( token.status ) {
            case Constants.GATEWAY_ACTIVATED:
                await this.activated();
                break;
            case Constants.GATEWAY_COMPLETED:
                // activate next
                await this.activateNext();
                break;
            default:
                // ignore token
        }           

        return true;
    }

    async activated() {
        switch ( this.data.type ) {
            // start
            case Constants.COMPLEX_GATEWAY:
                // TODO
                break;
            case Constants.EXCLUSIVE_GATEWAY:
                // merge - just passed trough
                let newToken = this.setNewStatus({ status: Constants.GATEWAY_COMPLETED })
                await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                break;
            case Constants.INCLUSIVE_GATEWAY:
                // TODO: merge -> wait, if as long as any other token can reach this gateway
                break;
            case Constants.PARALLEL_GATEWAY:
                // merge -> wait for all incoming
                await this.evaluateParallelGateway()
                break;
            case Constants.EVENT_BASED_GATEWAY:
                // do nothing - wait for event
                break;
        }
        return true;
    }

    async evaluateParallelGateway() {
        this.logger.debug("evaluate parallel gateway", { token: this.token });
        
        // just one incoming sequence: pass through
        if (this.data.incoming?.length <= 1) {
            let newToken = this.setNewStatus({ status: Constants.GATEWAY_COMPLETED })
            await this.process.logToken ({ consume: [this.token], emit: [newToken] });
            return true;
        }

        // wait for all incoming
        const active = await this.process.getActiveToken({ instanceId: this.token.instanceId }) || [];
        const received = [];
        const consume = [];
        for (const token of active) {
            if (token.elementId === this.data.id && token.status === Constants.GATEWAY_ACTIVATED ) {
                received.push(token.attributes?.lastToken?.elementId);
                consume.push(token);
            }
        }
        const complete = this.data.incoming.every(id => received.includes(id));
        if (complete) {
            let newToken = this.setNewStatus({ status: Constants.GATEWAY_COMPLETED })
            console.log("EMIT:", newToken);
            await this.process.logToken ({ consume, emit: [newToken] });
            return true;
        }
    }

    async activateNext() {
        this.logger.debug("get next", { token: this.token });

        // get next steps
        let next =  await this.process.getNext({ elementId: this.token.elementId });
        let newTokens = [];
        
        const valid = [];
        const def = [];

        this.logger.debug("Activate next", { token: this.token, next });
        if ( Array.isArray(next) ) {
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
                        lastToken: this.token
                    }
                };

                // check condition
                if (element.attributes?.expression) {
                    try {
                        // get context
                        const context = await this.process.getContextKeys({ instanceId: this.token.instanceId, input: element.attributes?.input });
                        // evaluate
                        const expression = element.attributes?.expression?.body || element.attributes?.object;
                        const result = await this.process.evaluate({ expression, context });
                        if (result === true) valid.push(newToken);
                    } catch (err) {
                        this.logger.debug("Execution of condition failed", { error: err });
                        // log error in context
                        await this.process.addToContext({ instanceId: this.token.instanceId, key: Constants.CONTEXT_ERROR, value: { element, error: "Execution of condition failed" }});
                        // consume token and emit next token with status "process error" 
                        const newToken = this.setNewStatus({ status: Constants.PROCESS_ERROR })
                        await this.process.logToken ({ consume: [this.token], emit: [newToken] });
                        return false;
                    }
                } else {
                    valid.push(newToken);
                }

                // is default?
                if (element.id === this.data.default) def.push(newToken);

            }
        }

        switch ( this.data.type ) {
            // start
            case Constants.EXCLUSIVE_GATEWAY:
                // the first valid or the first default
                if (valid.length > 0) {
                    newTokens.push(valid[0]);
                } else if (def.length > 0) {
                    newTokens.push(def[0]);
                }
                break;
            case Constants.INCLUSIVE_GATEWAY:
            case Constants.PARALLEL_GATEWAY:
            case Constants.COMPLEX_GATEWAY:
                    // all valid or the default
                if (valid.length > 0) {
                    newTokens.push(...valid);
                } else if (def.length > 0) {
                    newTokens.push(...def);
                }
                break;
            case Constants.EVENT_BASED_GATEWAY:
                // TODO the activated path
                break;
        }

        await this.process.logToken ({ consume: [this.token], emit: newTokens });
        if ( !Array.isArray(next) || next.length < 1 || newTokens.length < 1 ) {
            // no more elements -> check, if instance is completed
            await this.process.checkCompleted({ token: this.token });
        }
        return true;
    }

};

module.exports = {
    Context: context,
    DeploymentManager: new DeploymentManager(),
    Factory: new Factory(),
    Event,
    Activity,
    Sequence,
    Gateway
};
