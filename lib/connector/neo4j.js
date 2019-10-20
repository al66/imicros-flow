/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const db	= require("neo4j-driver").v1;
const Serializer = require("../util/serializer");
const { FlowError } = require("../util/errors");
const uuidV4 = require("uuid/v4");
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
        
        this.serializer = new Serializer();
        
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
    
    async addEvent (event) {
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
        statement += "MERGE (e:Event { uid: {uid}, ownerType: {ownerType}, ownerId: {ownerId} })-[:ASSIGNED]->(p) ";
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
    
    async createConstraints () {
        return this.run("CREATE CONSTRAINT ON (n:Node) ASSERT n.uid IS UNIQUE ")
        .then(() => this.run("CREATE CONSTRAINT ON (p:Process) ASSERT p.uid IS UNIQUE "))
        .then(() => this.run("CREATE CONSTRAINT ON (e:Event) ASSERT e.uid IS UNIQUE "))
        .then(() => this.run("CREATE CONSTRAINT ON (t:Task) ASSERT t.uid IS UNIQUE "))
        .then(() => this.run("CREATE CONSTRAINT ON (g:Gateway) ASSERT g.uid IS UNIQUE "))
        .then(() => {return true;})
        .catch(() => { throw new FlowError("Failed to create constraints");});
    }

    /**
     * Register this node in the database
     */
    async heartbeat () {
        let params = {
            node: this.broker.nodeID,
            timestamp: Date.now()
        };
        let statement = "MERGE (s:Node { uid: {node} }) ";
        statement += "ON MATCH SET s.heartbeat = {timestamp} ";
        statement += "ON CREATE SET s.heartbeat = {timestamp} ";
        let result = await this.run(statement, params);
        if (!result) {
            throw new FlowError("Failed to send heartbeat");
        }
        return result;
    }
    
    /**
     * Unregister this node in the database
     */
    async unregister () {
        let params = {
            node: this.broker.nodeID
        };
        let statement = "MATCH (s:Node { uid: {node} }) ";
        statement += "DELETE s ";
        let result = await this.run(statement, params);
        if (!result) {
            throw new FlowError("Failed to unregister node");
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
        return this.unregister().then(() => {
            this.driver.close();
            this.logger.info(`Disconnected from ${this.database.uri}`);
            return Promise.resolve();
        });
        
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