/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const db	= require("neo4j-driver").v1;
const _ = require("lodash");
const Serializer = require("../util/serializer");
const { FlowError, FlowUnvalidMapping } = require("../util/errors");
const uuidV4 = require("uuid/v4");
const mapper = require("../util/mapper");
const util = require("util");

class neo4j {
    
    constructor (broker, options) {
        
        this.broker = broker;
        this.logger = this.broker.logger;

        /* istanbul ignore else */
        if (!this.database) {
            this.database = {};
            this.database.uri = options.uri || "bolt://localhost:7474";
            this.database.user = options.user || "neo4j";
            this.database.password = options.password || "neo4j";
        }
        
        this.fetchBatchSize = options.fetchBatchSize || 5;
        
        this.serializer = new Serializer();
        
        this.worker = {
            uid: uuidV4()
        };
        
        this.services = new Set();
        this.actions = new Set();
        
    }
    
    start () {
        
    }
    
    stop () {
        
    }
    
    startService (service) {
        this.services.add(service.name);
        let actions = Object.keys(service.actions);
        for (let i=0; i< actions.length; i ++) this.actions.add(service.name + "." + actions[i]);
    }
    
    stopService (service) {
        this.services.delete(service.name);
        let actions = Object.keys(service.actions);
        for (let i=0; i< actions.length; i ++) this.actions.delete(service.name + "." + actions[i]);
    }
    
    getServiceNames() {
        return Array.from(this.services);
    }
    
    async emit (eventName, payload, meta) {
        // initialze missing parameters (start events w/o payload or meta data are allowed)
        if (!meta) meta = {};
        if (!payload) payload = {};

        // set context id
        let contextId = _.get(meta,"flow.contextId",uuidV4());
        
        // build context key for relation :Event<-:CONTEXT-:Context
        let contextKey;
        if (meta.flow && meta.flow.process) {
            contextKey = meta.flow.process + "." + meta.flow.step;
            if (meta.flow.cycle) contextKey += "." + meta.flow.cycle;
            contextKey += "." + eventName;
        }
        if (!contextKey) {
            if (meta.flow && meta.flow.contextId) throw new FlowError("Event w/o process step but with given context is not allowed");
            contextKey = eventName;
        }
        
        // set owner, if not given
        let owner = {
            type: _.get(meta,"owner.type","unknwon"),
            id: _.get(meta,"owner.id","unknwon")
        };

        // set process step
        let process = {
            name: _.get(meta,"flow.process",""),
            step: _.get(meta,"flow.step","")
        };
        
        let params = {
            eventName: eventName,
            uid: uuidV4(),
            timestamp: Date.now(),
            payload: await this.serializer.serialize(payload),
            meta: await this.serializer.serialize(meta),
            ownerType: owner.type,
            ownerId: owner.id,
            contextId: contextId,
            contextKey: contextKey,
            process: process.name,
            step: process.step
        };
        let statement = "MERGE (c:Context { uid: {contextId} } ) ";
        statement += "CREATE (e:Event:OpenEvent { uid: {uid} } )<-[:CONTEXT {key: {contextKey}}]-(c) ";
        statement += "SET e.name = {eventName}, e.timestamp = {timestamp}, e.process = {process}, e.step = {step}, ";
        statement += "e.ownerType = {ownerType}, e.ownerId = {ownerId}, e.payload = {payload}, e.meta = {meta} ";
        statement += "RETURN { id: e.uid, name: e.name, owner: { type: e.ownerType, id: e.ownerId }, timestamp: e.timestamp } AS event;";
        let result = await this.run(statement, params);
        if (!result) {
            throw new FlowError("Failed to emit event");
        }
        return result;
    }
    
    async fetchEvents (count) {
        let params = {
            worker: this.worker.uid,
            count: count
        };
        let statement = "MATCH (s:Worker { uid: {worker} }) ";
        statement += "MATCH (e:OpenEvent)<-[:CONTEXT]-(c:Context) ";
        statement += "CREATE (s)-[:ASSIGNED]->(e) ";
        statement += "REMOVE e:OpenEvent ";
        statement += "RETURN { uid: e.uid, name: e.name, owner: { type: e.ownerType, id: e.ownerId }, contextId: c.uid } AS event ";
        statement += "LIMIT {count} ";
        let result = await this.run(statement, params);
        if (!result) {
            throw new FlowError("Failed to fetch new events");
        }
        return result;
    }
    
    /**
     * Event Consumer
     *     - fetch a number of events
     *     - checks event for subscriptions
     *     - checks access authorization of each subscription for non-public events (owner is set)
     *     - schedules the given action in the subsription
     */
    async consume() {
        let events = await this.fetchEvents(this.fetchBatchSize);
        this.logger.debug(`${events.length} events fetched`, { events: events });
        let actions = [];
        let singleCall = async (call, event, meta, context) => {
            let action = _.pick(call,["service","action"]);
            // set full action name
            action.action = action.service + "." + action.action;
            // TODO: CHECK AUTHORIZATION

            // Set uid
            action.uid = uuidV4();
            // Set triggering event
            action.eventId = event.uid;
            // Set meta data
            _.set(meta,"flow.trigger.type", "event");
            _.set(meta,"flow.trigger.name", event.name);
            _.set(meta,"flow.trigger.id", event.uid);
            action.meta = await this.serializer.serialize(meta);
            // Map params
            try {
                let params = mapper(call.map, context);
                action.params = await this.serializer.serialize(params);
            } catch (err) {
                throw new FlowUnvalidMapping("unvalid task", { map: call.map });
            }
            // Set owner
            action.ownerType = call.owner.type;
            action.ownerId = call.owner.id;

            actions.push(action);
        };
        let singleEvent = async (event) => {
            let meta = event.meta ? await this.serializer.deserialize(event.meta) : {};
            let context = await this.context(event.contextId);
            let calls = await this.nextActions(event);
            for (let n=0; n<calls.length; n++) {
                await singleCall(calls[n].call, event, meta, context);
            }
        };
        for (let i=0; i<events.length; i++) {
            await singleEvent(events[i].event);
        } 
        
        await this.createActions(actions);
        return true;
    }
    
    async work() {
        await this.assignActions(5);
        let actions = await this.fetchActions(10);
        this.logger.debug(`${actions.length} actions fetched`, { actions: actions, worker: this.worker.uid, filter: Array.from(this.actions) });
        for (let i=0; i<actions.length; i++) {
            let action = actions[i].action;
            try {
                let res = await this.broker.call(`${action.service}.${action.action}`, action.params, { meta: action.meta });
                this.logger.debug(`Task ${action.service}.${action.action} executed`, { id: action.id, result: res });
            } catch (err) {
                this.logger.warn(`Call to task ${action.service}.${action.action} failed`, { error: err });
                throw err;
            }
        }
    }
    
    async createActions(actions) {
        if (actions.length <= 0) return 0;
        let params = {
            actions: actions
        };
        let statement = "UNWIND {actions} AS action ";
        statement += "MATCH (e:Event { uid: action.eventId }) ";
        statement += "CREATE (e)-[:NEXT]->(a:Action:OpenAction { uid: action.uid, service: action.service, action: action.action, params: action.params, ";
        statement += "meta: action.meta, ownerType: action.ownerType, ownerId: action.ownerId }) ";
        statement += "RETURN count(a) AS created;";
        let result = await this.run(statement, params);
        return result;
    }
    
    async assignActions(count) {
        let params = {
            worker: this.worker.uid,
            actions: Array.from(this.actions),
            count: count
        };
        let statement = "MATCH (s:Worker { uid: {worker} }) ";
        statement += "MATCH (a:OpenAction) ";
        statement += "WHERE a.action IN {actions} ";
        statement += "WITH s, a ";
        statement += "LIMIT {count} ";
        statement += "CREATE (s)-[:ASSIGNED]->(a) ";
        statement += "REMOVE a:OpenAction ";
        statement += "SET a:AssignedAction ";
        let result = await this.run(statement, params);
        return result;
    }
    
    async fetchActions(count) {
        let params = {
            worker: this.worker.uid,
            actions: Array.from(this.actions),
            count: count
        };
        let statement = "MATCH (:Worker { uid: {worker} })-[:ASSIGNED]->(a:AssignedAction) ";
        statement += "WHERE a.action IN {actions} ";
        statement += "WITH a ";
        statement += "LIMIT {count} ";
        statement += "REMOVE a:AssignedAction ";
        statement += "SET a:RunningAction ";
        statement += "RETURN { id: a.uid, service: a.service, action: a.action, params: a.params, meta: a.meta, ";
        statement += "owner: { type: a.ownerType, id: a.ownerId } } AS action ";
        let result = await this.run(statement, params);
        return result;
    }
    
    async context (contextId) {
        let params = {
            contextId: contextId
        };
        let statement = "MATCH (c:Context { uid: {contextId}})-[k:CONTEXT]->(e:Event) ";
        statement += "RETURN COLLECT({key: k.key, payload: e.payload}) AS context;";
        let result = await this.run(statement, params);
        if (!result) {
            throw new FlowError("Failed to get context");
        }
        let context = {};
        // deserialize payloads
        if (Array.isArray(result) && result[0].context) {
            let a = result[0].context;
            // set deep pathes
            for (let i=0; i<a.length; i++) {
                _.set(context,a[i].key, await this.serializer.deserialize(a[i].payload));
            }
        }
        return context;
    } 
    
    async addNext (listen, task) {
        let params = {
            listenEvent: listen.name,
            listenOwnerType: listen.owner.type,
            listenOwnerId: listen.owner.id,
            listenProcess: listen.process || "*",
            listenStep: listen.step || "*",
            taskProcess: task.process,
            taskStep: task.step,
            taskOwnerType: task.owner.type,
            taskOwnerId: task.owner.id,
            taskService: task.service,
            taskAction: task.action,
            taskMap: task.map ? JSON.stringify(task.map) : ".",
            doneEvent: task.onDone ? task.onDone.name : "END",
            errorEvent: task.onError ? task.onError.name : "END"
        };
        let statement = "MERGE (e:Event:Subscription { name: {listenEvent}, ownerType: {listenOwnerType}, ownerId: {listenOwnerId} }) ";
        statement += "MERGE (t:Task { process: {taskProcess}, step: {taskStep}, service: {taskService}, action: {taskAction}, ownerType: {taskOwnerType}, ownerId: {taskOwnerId} }) ";
        statement += "MERGE (e)-[n:NEXT { process: {listenProcess}, step: {listenStep} }]->(t) ";
        statement += "SET n.map = {taskMap} ";
        statement += "WITH e, t, n ";
        // delete existing relations for DONE and ERROR events before creating new connections, becaus they can now point to other events
        statement += "OPTIONAL MATCH (t)-[rd:DONE]->(:Event) ";
        statement += "OPTIONAL MATCH (t)-[re:ERROR]->(:Event) ";
        statement += "DELETE rd ";
        statement += "DELETE re ";
        statement += "WITH e, t, n ";
        // create now new relations for DONE and ERROR events
        statement += "MERGE (eventDone:Event { name: {doneEvent}, ownerType: {taskOwnerType}, ownerId: {taskOwnerId} }) ";
        statement += "MERGE (eventError:Event { name: {errorEvent}, ownerType: {taskOwnerType}, ownerId: {taskOwnerId} }) ";
        statement += "MERGE (t)-[done:DONE]->(eventDone) ";
        statement += "MERGE (t)-[error:ERROR]->(eventError) ";
        statement += "RETURN { name: e.name, ownerType: e.ownerType, ownerId: e.ownerId } AS event, ";
        statement += "{ process: t.process,  step: t.step, service: t.service, action: t.action, map: n.map, ownerType: t.ownerType, ownerId: t.ownerId } AS task, "; 
        statement += "{ process: n.process, step: n.step } AS listen;";
        let result = await this.run(statement, params);
        // convert mappings back to objects
        result.map(item => {
            if (item.task && item.task.map && item.task.map !== ".") item.task.map = JSON.parse(item.task.map);
            return item;
        });
        return result;
    }
    
    async nextActions (event) {
        let params = {
            listenEvent: event.name,
            listenOwnerType: event.owner.type || "",
            listenOwnerId: event.owner.id || "",
            listenProcess: event.process || "",
            listenStep: event.step || ""
        };
        let statement = "MATCH (e:Subscription { name: {listenEvent}, ownerType: {listenOwnerType}, ownerId: {listenOwnerId} }) ";
        statement += "MATCH (e)-[n:NEXT]->(t) ";
        statement += "MATCH (t)-[c:DONE]->(done:Event) ";
        statement += "MATCH (t)-[:ERROR]->(error:Event) ";
        statement += "WHERE n.process IN [{listenProcess},'*'] AND n.step IN [{listenStep},'*'] ";
        statement += "RETURN { ";
        statement += " service: t.service, action: t.action, map: n.map, ";
        statement += " meta: { flow: { process: t.process, step: t.step, onDone: { event: done.name }, onError: { event: error.name } } }, ";
        statement += " owner: { type: t.ownerType, id: t.ownerId } ";
        statement += "} AS call;";
        let result = await this.run(statement, params);
        // convert mappings back to objects
        result.map(item => {
            if (item.call && item.call.map && item.call.map !== ".") item.call.map = JSON.parse(item.call.map);
            return item;
        });
        return result;
    }
    
    async createConstraints () {
        return this.run("CREATE CONSTRAINT ON (s:Service) ASSERT s.name IS UNIQUE ")
        .then(() => this.run("CREATE CONSTRAINT ON (w:Worklist) ASSERT w.name IS UNIQUE "))
        .then(() => this.run("CREATE CONSTRAINT ON (e:Event) ASSERT e.uid IS UNIQUE "))
        .then(() => this.run("CREATE CONSTRAINT ON (c:Context) ASSERT c.uid IS UNIQUE  "))
        .then(() => {return true;})
        .catch(() => { throw new FlowError("Failed to create constraints");});
    }
    
    /**
     * Register this worker in the database
     */
    async heartbeat () {
        let params = {
            worker: this.worker.uid,
            timestamp: Date.now()
        };
        let statement = "MERGE (s:Worker { uid: {worker} }) ";
        statement += "ON MATCH SET s.heartbeat = {timestamp} ";
        statement += "ON CREATE SET s.heartbeat = {timestamp} ";
        let result = await this.run(statement, params);
        if (!result) {
            throw new FlowError("Failed to send heardbeat");
        }
        return result;
    }
    
    /**
     * Connect to database
     */
    connect() {

        this.driver = db.driver(this.database.uri, db.auth.basic(this.database.user, this.database.password));
        
        return this.heartbeat().then(() => {
            this.logger.info(`Connected to ${this.database.uri}`);
            return Promise.resolve();
        });
        
    }

    /**
     * Disconnect from database
     */
    disconnect() {
        
        /* istanbul ignore next */
        if (!this.driver) return Promise.resolve();
        this.driver.close();
        this.logger.info(`Disconnected from ${this.database.uri}`);
        return Promise.resolve();
        
    }

    /**
     * Convert neo4j integer to js integers (or strings)
     *
     * @param {Object} record
     * 
     * @returns {Object} converted record
     */
    transform(object) {
        for (let property in object) {
            if (object.hasOwnProperty(property)) {
                const propertyValue = object[property];
                if (db.isInt(propertyValue)) {
                    if (db.integer.inSafeRange(propertyValue)) {
                        object[property] = propertyValue.toNumber();
                    } else {
                        object[property] = propertyValue.toString();
                    }
                } else if (typeof propertyValue === "object") {
                    this.transform(propertyValue);
                }
            }
        }
    }    
    
    /**
     * Execute statement
     *
     * @param {String} statement 
     * @param {Object} execution parameters 
     * 
     * @returns {Object} result
     */
    run(statement, param) {
        let session = this.driver.session();
        let response = [];
        let self = this;

        return session
            .run(statement, param)
            .then(function (result) {
                if (result.records) {
                    result.records.forEach(function (record) {
                        // Convert Integer
                        try {
                            self.transform(record);
                        } catch (err) {
                            self.logger.error(`Database err - integer transformation: ${JSON.stringify(err)}`);
                        }
                        response.push(record.toObject());
                    });
                }
                session.close();
                return response;
            })
            .catch(err => {
                self.logger.error(`Database Statement ${statement} with params ${JSON.stringify(param)}`);
                self.logger.error(`Database driver error: ${JSON.stringify(err)}`);
            });
    }    
    
}

module.exports = neo4j;