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
const Constants = require("../util/constants");

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
    
    async addProcess (process) {
        let params = {
            uid: process.id || uuidV4(),
            name: process.name,
            ownerType: process.owner.type,
            ownerId: process.owner.id,
        };
        let statement = "MERGE (p:Process { uid: {uid}, ownerType: {ownerType}, ownerId: {ownerId} }) ";
        statement += "SET p.name = {name} ";
        statement += "RETURN p.uid AS id;";
        let result = await this.run(statement, params);
        return result;
    }
    
    async addSubscription (event) {
        let params = {
            processId: event.processId,
            uid: event.id || uuidV4(),
            name: event.name,
            position: event.position || Constants.START_EVENT,
            type: event.type || Constants.DEFAULT_EVENT,
            direction: event.direction || Constants.CATCHING_EVENT,
            interaction: event.interaction || "",
            ownerType: event.owner.type,
            ownerId: event.owner.id
        };
        let statement = "MATCH (p:Process { uid: {processId}, ownerType: {ownerType}, ownerId: {ownerId} }) ";
        statement += "WITH p ";
        statement += "MERGE (e:Subscription { uid: {uid}, ownerType: {ownerType}, ownerId: {ownerId} })-[:ASSIGNED]->(p) ";
        statement += "SET e.name = {name}, e.position = {position}, e.type = {type}, e.direction = {direction}, e.interaction = {interaction} ";
        statement += "RETURN e.uid AS id ";
        let result = await this.run(statement, params);
        return result;
        
    }
    
    async addTask (task) {
        let type  = "";
        type = (task.service && task.action) ? Constants.SERVICE_TASK : type;
        let params = {
            processId: task.processId,
            uid: task.id || uuidV4(),
            name: task.name,
            ownerType: task.owner.type,
            ownerId: task.owner.id,
            type: type,
            service: task.service,
            action: task.action,
            map: task.map ? JSON.stringify(task.map) : "."
        };
        let statement = "MATCH (p:Process { uid: {processId}, ownerType: {ownerType}, ownerId: {ownerId} }) ";
        statement += "WITH p ";
        statement += "MERGE (t:Task { uid: {uid}, ownerType: {ownerType}, ownerId: {ownerId} })-[:ASSIGNED]->(p) ";
        statement += "SET t.name = {name}, t.service = {service}, t.action = {action}, t.map = {map}, t.type = {type} ";
        statement += "RETURN t.uid AS id ";
        let result = await this.run(statement, params);
        return result;
        
    }
    
    async addGateway (gateway) {
        let params = {
            processId: gateway.processId,
            uid: gateway.id || uuidV4(),
            type: gateway.type || Constants.EXCLUSIVE_GATEWAY,
            ownerType: gateway.owner.type,
            ownerId: gateway.owner.id,
            rule: await this.serializer.serialize(gateway.rule),
            function: await this.serializer.serialize(gateway.function)
        };
        let statement = "MATCH (p:Process { uid: {processId}, ownerType: {ownerType}, ownerId: {ownerId} }) ";
        statement += "WITH p ";
        statement += "MERGE (g:Gateway { uid: {uid}, ownerType: {ownerType}, ownerId: {ownerId} })-[:ASSIGNED]->(p) ";
        statement += "SET g.type = {type}, g.rule = {rule}, g.function = {function} ";
        statement += "RETURN g.uid AS id ";
        let result = await this.run(statement, params);
        return result;
        
    }
    
    async addSequence (connection) {
        let type = connection.type || Constants.SEQUENCE_STANDARD;
        let params = {
            fromId: connection.fromId,
            toId: connection.toId,
            ownerType: connection.owner.type,
            ownerId: connection.owner.id
        };
        let statement = "MATCH (from { uid: {fromId}, ownerType: {ownerType}, ownerId: {ownerId} }) ";
        statement += "MATCH (to { uid: {toId}, ownerType: {ownerType}, ownerId: {ownerId} }) ";
        statement += "MERGE (from)-[r:" + type + "]->(to) ";
        statement += "RETURN { from: from.uid, to: to.uid, type: type(r)  } AS connection ";
        let result = await this.run(statement, params);
        return result;
        
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
    
    async assignEvents(count) {
        let params = {
            worker: this.worker.uid,
            count: count
        };
        let statement = "MATCH (e:OpenEvent) ";
        statement += "WITH e ORDER BY e.timestamp LIMIT {count} ";
        statement += "REMOVE e:OpenEvent ";
        statement += "SET e:AssignedEvent, e.processed_by = {worker} ";
        let result = await this.run(statement, params);
        return result;
    }
    
    async fetchEvents (count) {
        let params = {
            worker: this.worker.uid,
            count: count
        };
        let statement = "MATCH (e:AssignedEvent  { processed_by: {worker} } )<-[:CONTEXT]-(c:Context) ";
        statement += "WITH e, c ";
        statement += "LIMIT {count} ";
        statement += "REMOVE e:AssignedEvent ";
        statement += "SET e:FetchedEvent ";
        statement += "RETURN { uid: e.uid, name: e.name, owner: { type: e.ownerType, id: e.ownerId }, contextId: c.uid } AS event ";
        /* alternateive: assign + fetch in one step - but increases the execution time factor 4
        let statement = "MATCH (e:OpenEvent) ";
        statement += "WHERE NOT EXISTS(e.processed_by) ";
        statement += "WITH e LIMIT {count} ";
        statement += "SET e._LOCK_ = true ";
        statement += "WITH COLLECT(e) AS lockedEvents ";
        statement += "WITH REDUCE(a = [], e IN lockedEvents | CASE WHEN NOT EXISTS(e.processed_by) THEN a + e ELSE a END ) AS eventsToAssign, lockedEvents ";
        statement += "FOREACH(e IN eventsToAssign | SET e:FetchedEvent, e.procssed_by = {worker} ) ";
        statement += "FOREACH(e IN lockedEvents | REMOVE e._LOCK_ ) ";
        statement += "WITH eventsToAssign ";
        statement += "UNWIND eventsToAssign AS e ";
        statement += "MATCH (e)<-[:CONTEXT]-(c:Context) ";
        statement += "RETURN { uid: e.uid, name: e.name, owner: { type: e.ownerType, id: e.ownerId }, contextId: c.uid } AS event ";
        */
        let result = await this.run(statement, params);
        if (!result) {
            throw new FlowError("Failed to fetch new events");
        }
        return result;
    }
    
    /**
     * Event Consumer
     *     - fetch a number of events
     *     - call subscription handler
     */
    async consume() {
        await this.assignEvents(this.fetchBatchSize);
        let events = await this.fetchEvents(this.fetchBatchSize * 2);
        this.logger.debug(`${events.length} events fetched`, { events: events });
        let singleEvent = async (event) => {
            let meta = event.meta ? await this.serializer.deserialize(event.meta) : {};
            let context = await this.context(event.contextId);

            await this.handleActions(event, meta, context);
            await this.handleGateways(event, meta, context);
        };
        for (let i=0; i<events.length; i++) {
            await singleEvent(events[i].event);
        } 
        return true;
    }
    
    /**
     * Sequence Handler for Actions
     *     - checks event for tasks in sequence
     *     - checks access authorization of each subscription for non-public events (owner is set)
     *     - schedules the given action in the subsription
     */
    async handleActions(event, meta, context) {
        let actions = [];
        let calls = await this.nextActions(event);
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
            _.set(meta,"flow.action", {});
            _.set(meta,"flow.action.id", action.uid);
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
        for (let n=0; n<calls.length; n++) {
            await singleCall(calls[n].call, event, meta, context);
        }
        await this.createActions(actions);
        return true;
    }

    /**
     * Sequence Handler for Gateways
     *     - checks event for gatways in sequence
     *     - checks access authorization of each subscription for non-public events (owner is set)
     *     - schedules an action for the gateway type
     */
    async handleGateways(event, meta, context) {
        /*
        let actions = [];
        let calls = await this.nextActions(event);
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
        for (let n=0; n<calls.length; n++) {
            await singleCall(calls[n].call, event, meta, context);
        }
        await this.createActions(actions);
        */
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
        .then(() => this.run("CREATE CONSTRAINT ON (p:Process) ASSERT p.uid IS UNIQUE "))
        .then(() => this.run("CREATE CONSTRAINT ON (s:Subscription) ASSERT s.uid IS UNIQUE "))
        .then(() => this.run("CREATE CONSTRAINT ON (t:Task) ASSERT t.uid IS UNIQUE "))
        .then(() => this.run("CREATE CONSTRAINT ON (g:Gateway) ASSERT g.uid IS UNIQUE "))
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