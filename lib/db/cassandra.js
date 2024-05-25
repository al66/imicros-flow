/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const Cassandra = require("cassandra-driver");
const crypto = require("crypto");
const Constants = require("../util/constants");
const { v4: uuid, validate } = require("uuid");

const { Serializer } = require("../serializer/base");
const { Timer } = require("../timer/timer");

class DB {
 
    constructor ({ broker, options = {}, services = {}}) {
        
        // Moleculer service broker & logger
        this.broker = broker;
        this.logger = this.broker.logger;

        // serializer
        this.serializer = new Serializer();

        // services
        this.services = services;

        // service name
        this.name = "flow";

        // encryption setup
        this.encryption = {
            iterations: 1000,
            ivlen: 16,
            keylen: 32,
            digest: "sha512"
        };

        // cassandra setup
        this.contactPoints = ( options.contactPoints ?? "127.0.0.1" ).split(",");
        this.datacenter = options.datacenter ?? "datacenter1";
        this.keyspace = options.keyspace ?? "imicros_flow";
        this.versionTable = options.versionTable ?? "versions";
        this.subscriptionTable = options.subscriptionTable ?? "subscriptions";
        this.contextTable = options.contextTable ?? "context";
        this.activeTable = options.activeTable ?? "active";
        this.instanceTable = options.instanceTable ?? "instances";
        this.runningTable = options.runningTable ?? "running";
        this.completedTable = options.completedTable ?? "completed";
        this.failedTable = options.failedTable ?? "failed";
        this.tokenTable = options.tokenTable ?? "log";
        this.timerTable = options.timerTable ?? "timer";
        this.runnerTable = options.runnerTable ?? "runner";
        this.config = {
            contactPoints: this.contactPoints, 
            localDataCenter: this.datacenter, 
            keyspace: this.keyspace, 
            protocolOptions: { 
                port: options.port ?? (process.env.CASSANDRA_PORT || 9042 )
            },
            credentials: { 
                username: options.user ?? (process.env.CASSANDRA_USER || "cassandra"), 
                password: options.password ?? (process.env.CASSANDRA_PASSWORD || "cassandra") 
            },
            policies: {
                reconnection: new Cassandra.policies.reconnection.ConstantReconnectionPolicy(10)    // reconnection after 10 ms
            }
        };
        this.cassandra = new Cassandra.Client(this.config);

    }

    /** database methods for usage by main service */
    async saveProcess({ opts, xmlData, parsedData }) {
        try {
            const owner = opts.acl?.ownerId || null;
            const oek = await this._getKey({ opts });

            let attributes = await this.serializer.serialize({
                name: parsedData?.process?.name ?? "unknown"
            });
            let parsed = await this.serializer.serialize(parsedData);
            let xml = xmlData;

            // encrypt
            let iv = crypto.randomBytes(this.encryption.ivlen);
            // hash encription key with iv
            let key = crypto.pbkdf2Sync(oek.key, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);
            // encrypt data
            attributes = this._encrypt({ value: attributes, secret: key, iv: iv });
            parsed = this._encrypt({ value: parsed, secret: key, iv: iv });
            xml = this._encrypt({ value: xml, secret: key, iv: iv });

            this.logger.debug("Encrpted data", {owner,attributes,parsed,xml});
    
            // update process table ?? needed ??
            // update version table
            const queries = [];
            let query = "INSERT INTO " + this.versionTable + " (owner,process,deployed,version,attributes,xml,parsed,oek,iv) VALUES (:owner,:process,toTimeStamp(now()),:version,:attributes,:xml,:parsed,:oek,:iv);";
            let params = { 
                owner, 
                process: parsedData.process?.id, 
                version: parsedData.version?.id, 
                attributes,
                xml,
                parsed,
                oek: oek.id,
                iv: iv.toString("hex")
            };
            queries.push({ query, params});
            await this.cassandra.batch(queries, {prepare: true});
            return { processId: parsedData.process.id, versionId: parsedData.version.id };
        } catch (e) {
            this.logger.warn("DB: failed to store process", { e });
            throw new Error("DB: failed to store process", e);
        }
    }

    async getProcess({ opts, processId, versionId, xml = null }) {
        try {
            const owner = opts.acl?.ownerId || null;
            let returnValue = {
                processId: null,
                versionId: null,
                parsedData: {},
                created: null
            };

            // query version table
            const query = `SELECT deployed, parsed, ${xml ? "xml," : ""} oek, iv FROM ${this.versionTable} 
                     WHERE owner = :owner AND process = :processId AND version = :versionId;`;
            const params = {
                owner,
                processId,
                versionId
            }
            let result = await this.cassandra.execute(query,params,{ prepare: true});
            let row = result.first();
            if (row) {

                returnValue.created = row.get("deployed");
                let oekId = row.get("oek");
                let iv = Buffer.from(row.get("iv"), "hex");
                let encrypted = row.get("parsed");
                
                // get owner's encryption key
                let oek;
                oek = await this._getKey({ opts, id: oekId });

                // hash received key with salt
                let key = crypto.pbkdf2Sync(oek.key, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);

                // decrypt value
                returnValue.parsedData = this._decrypt({ encrypted: encrypted, secret: key, iv: iv });
                
                // deserialize value
                returnValue.parsedData = await this.serializer.deserialize(returnValue.parsedData);

                // decrypt xml
                if (xml) {
                    let encrypted = row.get("xml");
                    returnValue.xmlData = this._decrypt({ encrypted: encrypted, secret: key, iv: iv });
                }

                returnValue.processId = returnValue.parsedData?.process?.id;
                returnValue.versionId = returnValue.parsedData?.version?.id;
            } else {
                this.logger.warn("Unvalid or empty result", { result, first: row, query, params });
                throw new Error("process not found");
            }

            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to retrieve process", { processId, versionId, e });
            throw new Error("DB: failed to retrieve process", e);
        }
    }


    async getProcessList({ opts, parsed = false }) {
        const resultList = [];
        // query version table
        const versions = await this.getVersionList({ opts });
        // query active table
        const active = (await this.getActive({ opts })).map(element => element.versionId);

        // filter versions by active table an remember last deployed version of inactive
        const latest = {};
        versions.forEach(version => {
            if (active.includes(version.versionId)) {
                version.active = true;
                if (!parsed) delete version.parsed;
                resultList.push(version);
            } else {
                if (!latest[version.processId] || latest[version.processId].created <= version.started) {
                    version.active = false;
                    if (!parsed) delete version.parsed;
                    latest[version.processId] = version;
                }
            }
        })
        // add latest deployed version for inactive process
        for(let processId in latest) {
            resultList.push(latest[processId]);
        } 

        return resultList;
    }

    async getVersionList({ opts, processId }) {
        try {
            const owner = opts.acl?.ownerId || null;
            let list = [];

            // query version table
            let query = `SELECT process, version, deployed, parsed, oek, iv FROM ${this.versionTable}`;
            if (processId) {
                query += ` WHERE owner = :owner AND process = :processId;`;
            } else {
                query += ` WHERE owner = :owner;`;
            }
            const params = {
                owner,
                processId
            }
            let result = await this.cassandra.execute(query, params, {prepare: true});
            for (const row of result) {
                // decode data
                let oekId = row.get("oek");
                let iv = Buffer.from(row.get("iv"), "hex");
                let encrypted = row.get("parsed");
                
                // get owner's encryption key
                let oek = await this._getKey({ opts, id: oekId });

                // hash received key with salt
                let key = crypto.pbkdf2Sync(oek.key, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);

                // decrypt value
                let parsed = this._decrypt({ encrypted, secret: key, iv: iv });
                
                // deserialize value
                parsed = await this.serializer.deserialize(parsed);

                list.push({
                    processId: row["process"].toString(),
                    versionId: row["version"].toString(),
                    created: row["deployed"],
                    name: parsed.process.name,
                    parsed
                });
            }
            return list;
        } catch (e) {
            this.logger.warn("DB: failed to retrieve process versions", { e });
            throw new Error("DB: failed to retrieve process versions", e);
        }
    }

    async activateVersion({ opts, processId, versionId }) {
        try {
            const owner = opts.acl?.ownerId || null;

            // get encryption key
            const oek = await this._getKey({ opts });
            // hash encription key with iv
            let iv = crypto.randomBytes(this.encryption.ivlen);
            let key = crypto.pbkdf2Sync(oek.key, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);

            const { parsedData } = await this.getProcess({ opts, processId, versionId });
            const queries = [];
            const returnValue = {
                processId,
                versionId
            };
            // update subscription table
            await parsedData.event.forEach(async (event) => {
                let subscribe = false;
                // Start event - default or signal
                if (event.position === Constants.START_EVENT && ( event.type === Constants.DEFAULT_EVENT || event.type === Constants.SIGNAL_EVENT )) subscribe = true;
                // Intermediate catching event - default or signal
                if (event.position === Constants.INTERMEDIATE_EVENT && event.direction === Constants.CATCHING_EVENT && ( event.type === Constants.DEFAULT_EVENT || event.type === Constants.SIGNAL_EVENT )) subscribe = true;
                if (subscribe) {
                    let data = await this.serializer.serialize(event);
                    data = this._encrypt({ value: data, secret: key, iv: iv });
                    let query = "INSERT INTO " + this.subscriptionTable + " (owner,event,process,version,element,data,oek,iv) VALUES (:owner,:event,:process,:version,:element,:data,:oek,:iv);";
                    let params = { 
                        owner, 
                        event: this._getHash(event.attributes?.name || event.name),
                        process: parsedData.process?.id, 
                        version: parsedData.version?.id, 
                        element: event.id,
                        data,
                        oek: oek.id,
                        iv: iv.toString("hex")
                    };
                    queries.push({ query, params});
                }
                // Start event - timer 
                if (event.position === Constants.START_EVENT && event.type === Constants.TIMER_EVENT && event.attributes?.timer) {
                    const timer = new Timer(event.attributes.timer);
                    const time = timer.next();
                    if (time) {
                        // token is not encrypted! Do not add critical information...
                        const token = {
                            processId,
                            versionId,
                            instanceId: uuid(),
                            elementId: event.id,
                            type: event.type,
                            status: Constants.EVENT_ACTIVATED,
                            // ... user id should be ok
                            user: {
                                id: opts.user?.id
                            },
                            ownerId: opts.acl.ownerId,
                            attributes: {
                                time
                            }
                        };
                        // serialize payload
                        const payload = JSON.stringify({ timer: timer.timer, token });                
                        // insert db
                        let query = "INSERT INTO " + this.timerTable + " (day,timeblock,id,time,payload) VALUES (:timeblock,:timeblock,:id,:time,:payload);";
                        // ( day date, time timestamp, id uuid, payload varchar, runner uuid, fetched timestamp, ack timestamp, PRIMARY KEY ((day), time, id) )
                        let params = { 
                            timeblock: this.calculateTimeBlock({ time }),  // just minutes
                            time,
                            id: uuid(), 
                            payload
                        };
                        queries.push({ query, params});
                    }
                }
            });
            await this.cassandra.batch(queries, {prepare: true});
            // update active table (must be separate as it cannot be a prepared statement)
            const query = `UPDATE ${this.activeTable} SET active[${processId}] = ${versionId} WHERE owner = ${owner};`;
            await this.cassandra.execute(query);
            // -> { procesId:uuid, versionId:uuid, name:string }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to activate version", { processId, versionId, e });
            throw new Error("DB: failed to activate version", e);
        }
    }

    async deactivateProcess({ opts, processId }) {
        try {
            const owner = opts.acl?.ownerId || null;
            const returnValue = {
                processId
            };
            // update active table
            const query = `DELETE active[${processId}] FROM ${this.activeTable } WHERE owner = ${owner};`;
            await this.cassandra.execute(query);
            // -> { procesId:uuid, versionId:uuid, name:string }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to deactivate process", { processId, e });
            throw new Error("DB: failed to deactivate process", e);
        }
    }

    async getActive({ opts }) {
        try {
            const owner = opts.acl?.ownerId || null;
            const returnValue = [];
            // query active table
            let query = "SELECT active FROM " + this.activeTable;
            query += " WHERE owner = :owner;";
            let params = { 
                owner
            };
            let result = await this.cassandra.execute(query, params, { prepare: true });
            for (const row of result) {
                let active = row.get("active");
                for (let processId in active) {
                    returnValue.push({
                        processId,
                        versionId: active[processId].toString()
                    });
                }
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to retrieve active versions", { e });
            throw new Error("DB: failed to retrieve active versions", e);
        }
    }
    async getSubscriptions({ opts, eventName }) {
        try {
            const owner = opts.acl?.ownerId || null;
            let subscriptions = [];
            // query subscription table
            let query = "SELECT process, version, element, data, oek, iv FROM " + this.subscriptionTable;
            query += " WHERE owner = :owner AND event = :event;";
            let params = { 
                owner, 
                event: this._getHash(eventName)
            };
            let result = await this.cassandra.execute(query, params, { prepare: true });
            for (const row of result) {
                // decode data
                let oekId = row.get("oek");
                let iv = Buffer.from(row.get("iv"), "hex");
                let encrypted = row.get("data");
                
                // get owner's encryption key
                let oek = await this._getKey({ opts, id: oekId });

                // hash received key with salt
                let key = crypto.pbkdf2Sync(oek.key, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);

                // decrypt value
                let element = this._decrypt({ encrypted: encrypted, secret: key, iv: iv });
                
                // deserialize value
                element = await this.serializer.deserialize(element);

                subscriptions.push({
                    ownerId: owner,
                    processId: row["process"].toString(),
                    versionId: row["version"].toString(),
                    elementId: row["element"].toString(),
                    element
                });
            }
            // get active processes
            const active = await this.getActive({ opts });
            const versions = active.map(element => element.versionId);

            // filter subscriptions start events by active processes
            // TODO: Intermediate events always (process version may be inactive meanwhile)
            let returnValue = subscriptions.filter(subscription => versions.includes(subscription.versionId));

            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to retrieve subscriptions", { eventName, e });
            throw new Error("DB: failed to retrieve subscriptions", e);
        }
    }

    async getElement({opts, processId, versionId, elementId}) {
        // get parsed
        const { parsedData } = await this.getProcess({ opts, processId, versionId })
        // search in sequences
        let element = parsedData.sequence.find(sequence => sequence.id === elementId);
        // search in tasks
        if (!element) element = parsedData.task.find(task => task.id === elementId);
        // search in events
        if (!element) element = parsedData.event.find(event => event.id === elementId);
        // search in gateways

        return element;
    }

    async getNext({opts, processId, versionId, elementId}) {
        let next = [];
        // get parsed
        const { parsedData } = await this.getProcess({ opts, processId, versionId })
        // search in sequences
        let element = parsedData.sequence.find(sequence => sequence.id === elementId);
        // search in tasks
        if (!element) element = parsedData.task.find(task => task.id === elementId);
        // search in events
        if (!element) element = parsedData.event.find(event => event.id === elementId);
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
            let element = parsedData.sequence.find(sequence => sequence.id === id);
            // search in tasks
            if (!element) element = parsedData.task.find(task => task.id === id);
            // search in events
            if (!element) element = parsedData.event.find(event => event.id === id);
            // TODO search in gateways

            return element;
        });

        return next;
    }

    async getPrevious({opts, processId, versionId, elementId}) {
        let previous = [];
        // get parsed
        const { parsedData } = await this.getProcess({ opts, processId, versionId })
        // search in sequences
        let element = parsedData.sequence.find(sequence => sequence.id === elementId);
        // search in tasks
        if (!element) element = parsedData.task.find(task => task.id === elementId);
        // search in events
        if (!element) element = parsedData.event.find(event => event.id === elementId);
        // TODO search in gateways

        // sequence
        if (element.type === Constants.SEQUENCE_STANDARD) {
            if (element.toId) previous.push(element.fromId);
        // task, event or gateway
        } else {
            if (Array.isArray(element.incoming)) previous = previous.concat(element.incoming);
        };

        // map id to element
        previous = previous.map(id => {
            // search in sequences
            let element = parsedData.sequence.find(sequence => sequence.id === id);
            // search in tasks
            if (!element) element = parsedData.task.find(task => task.id === id);
            // search in events
            if (!element) element = parsedData.event.find(event => event.id === id);
            // TODO search in gateways

            return element;
        });

        return previous;
    }

    async createInstance ({ opts, processId, versionId, instanceId }) {
        try {
            const owner = opts.acl?.ownerId || null;
            const queries = [];
            let query = "INSERT INTO " + this.instanceTable + " (owner,process,version,instance,created) VALUES (:owner,:process,:version,:instance,toTimeStamp(now()));";
            let params = { 
                owner, 
                process: processId, 
                version: versionId, 
                instance: instanceId
            };
            queries.push({ query, params});
            query = "INSERT INTO " + this.runningTable + " (owner,process,version,instance,started) VALUES (:owner,:process,:version,:instance,toTimeStamp(now()));";
            queries.push({ query, params});
            await this.cassandra.batch(queries, {prepare: true});
            return { processId, versionId, instanceId };
        } catch (e) {
            this.logger.warn("DB: failed to store new instance", { e });
            throw new Error("DB: failed to store new instance", e);
        }
    }

    async updateInstance ({ opts, processId, versionId, instanceId, failed, completed }) {
        try {
            const owner = opts.acl?.ownerId || null;
            const queries = [];
            const table = completed ? this.completedTable : ( failed ? this.failedTable : null );
            if (!table) throw new Error("Missing new status");
            let query = "INSERT INTO " + table + " (owner,process,version,instance,finished) VALUES (:owner,:process,:version,:instance,toTimeStamp(now()));";
            let params = { 
                owner, 
                process: processId, 
                version: versionId, 
                instance: instanceId
            };
            queries.push({ query, params});
            query = "DELETE FROM " + this.runningTable + " WHERE owner = :owner AND process = :process AND version = :version AND instance = :instance;";
            queries.push({ query, params});
            await this.cassandra.batch(queries, {prepare: true});
            return { processId, versionId, instanceId };
        } catch (e) {
            this.logger.warn("DB: failed to update instance status", { e });
            throw new Error("DB: failed to update instance status", e);
        }
    }

    async addContextKey ({ opts, instanceId, key, value }) {
        try {
            const owner = opts.acl?.ownerId || null;
            const oek = await this._getKey({ opts });
            // put key and hash in one string
            const valueString = await this.serializer.serialize({
                key,
                value
            });                
            // encrypt value
            let iv = crypto.randomBytes(this.encryption.ivlen);
            // hash encription key with iv
            let secret = crypto.pbkdf2Sync(oek.key, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);
            // encrypt value
            let encrypted = this._encrypt({ value: valueString, secret, iv });
            // insert db            
            let query = "INSERT INTO " + this.contextTable + " (owner,instance,key,value,oek,iv) VALUES (:owner,:instance,:key,:value,:oek,:iv);";
            let params = { 
                owner: owner, 
                instance: instanceId, 
                key: this._getHash(key),
                value : encrypted,
                oek: oek.id,
                iv: iv.toString("hex")
            };
            await this.cassandra.execute(query, params, {prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to insert context key", { instanceId, e });
            throw new Error("DB: failed to insert context key", e);
        }
    }

    async updateContext({ opts, instanceId, context }) {
        if (Object.entries(context).length === 0) return;
        try {
            const owner = opts.acl?.ownerId || null;
            const oek = await this._getKey({ opts });

            // get secret
            let iv = crypto.randomBytes(this.encryption.ivlen);
            // hash encription key with iv
            let secret = crypto.pbkdf2Sync(oek.key, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);

            const queries = [];
            for (const [key, value] of Object.entries(context)) {
                // put key and hash in one string
                const valueString = await this.serializer.serialize({
                    key,
                    value
                });                
                // encrypt value
                let encrypted = this._encrypt({ value: valueString, secret, iv });
                // insert db            
                let query = "INSERT INTO " + this.contextTable + " (owner,instance,key,value,oek,iv) VALUES (:owner,:instance,:key,:value,:oek,:iv);";
                let params = { 
                    owner: owner, 
                    instance: instanceId, 
                    key: this._getHash(key),
                    value : encrypted,
                    oek: oek.id,
                    iv: iv.toString("hex")
                };
                queries.push({ query, params});
            }
            if (queries.length > 0) await this.cassandra.batch(queries, {prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to update context", { instanceId, e });
            throw new Error("DB: failed to update context", e);
        }
    }

    async getContextKey ({ opts, instanceId, key }) {
        try {
            const owner = opts.acl?.ownerId || null;
            let returnValue = {};

            let query = "SELECT owner, instance, key, value, oek, iv FROM " + this.contextTable;
            query += " WHERE owner = :owner AND instance = :instance AND key = :key;";
            let params = { 
                owner: owner, 
                instance: instanceId, 
                key: this._getHash(key)
            };
            let result = await this.cassandra.execute(query, params, { prepare: true });
            let row = result.first();
            if (row) {
                let oekId = row.get("oek");
                let iv = Buffer.from(row.get("iv"), "hex");
                let encrypted = row.get("value");
                const oek = await this._getKey({ opts, id: oekId });
                // hash received key with salt
                let secret = crypto.pbkdf2Sync(oek.key, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);
                // decrypt value
                let valueString = this._decrypt({ encrypted, secret, iv });
                // deserialize value
                returnValue = (await this.serializer.deserialize(valueString))?.value ?? {};
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to read context key", { instanceId, e });
            throw new Error("DB: failed to read context key", e);
        }
    }

    async getContext ({ opts, instanceId }) {
        try {
            const owner = opts.acl?.ownerId || null;
            let returnValue = {};

            let query = "SELECT owner, instance, value, oek, iv FROM " + this.contextTable;
            query += " WHERE owner = :owner AND instance = :instance;";
            let params = { 
                owner: owner, 
                instance: instanceId
            };
            let result = await this.cassandra.execute(query, params, { prepare: true });
            for (const row of result) {
                let oekId = row.get("oek");
                let iv = Buffer.from(row.get("iv"), "hex");
                let encrypted = row.get("value");
                const oek = await this._getKey({ opts, id: oekId });
                // hash received key with salt
                let secret = crypto.pbkdf2Sync(oek.key, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);
                // decrypt value
                let valueString = this._decrypt({ encrypted, secret, iv });
                // deserialize value
                let keyValue = await this.serializer.deserialize(valueString);
                if (keyValue.key && keyValue.value) returnValue[keyValue.key] = keyValue.value;
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to read context key", { instanceId, e });
            throw new Error("DB: failed to read context key", e);
        }
    }

    async getContextKeys ({ opts, instanceId, keys = [] }) {
        let result = {};
        for (let i = 0; i < keys.length; i++ ) {
            result[keys[i]] = await this.getContextKey({ opts, instanceId, key: keys[i] });
        }
        return result;
    }

    async logToken ({ opts, instanceId, consume = [], emit = [] }) {
        try {
            const owner = opts.acl?.ownerId || null;
            const returnValue = {
                instanceId,
                consumed: consume,
                emitted: emit
            };
            // anything to do?
            if (consume.length > 0 || emit.length > 0) {
                // update token table
                let query = "UPDATE " + this.tokenTable +" SET "
                let more = false;
                await consume.forEach(async token => {
                    token = await this.serializer.serialize(token);
                    query += (more ? "," : "") + " active = active - {'" + token + "'} ";
                    more = true;
                    query += (more ? "," : "") + " history = history + { now() : '" + token + "'} ";
                })
                await emit.forEach(async token => {
                    token = await this.serializer.serialize(token);
                    query += (more ? "," : "") + " active = active + {'" + token + "'} ";
                    more = true;
                })
                query += ` WHERE owner = '${owner}' AND instance = ${instanceId};` ;
                await this.cassandra.execute(query);
            } 
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to log token", { instanceId, e });
            throw new Error("DB: failed to log token", e);
        }
    }

    async getToken ({ opts, instanceId, history = false }) {
        try {
            const owner = opts.acl?.ownerId || null;
            const returnValue = {
                instanceId,
                active: []
            };
            if (history) returnValue.history = [];
            // query token table
            let query = "SELECT active FROM " + this.tokenTable +" "
            if (history) query = "SELECT active, history FROM " + this.tokenTable +" "
            query += " WHERE owner = :owner AND instance = :instance;";
            let params = { 
                owner,
                instance: instanceId
            };
            let result = await this.cassandra.execute(query, params, { prepare: true });
            let row = result.first();
            let dbActive = [];
            let dbHistory = {};
            if (row) {
                let active = row.get("active");
                if (active) dbActive  = Array.isArray(active) ? active : [active];
                if (history) dbHistory = row.get("history");
            }
            returnValue.active = await Promise.all(dbActive.map(async token => await this.serializer.deserialize(token)));
            for(
                let uuid in dbHistory) {
                   returnValue.history.push({
                    time: this._getDateFromUuid(uuid),
                    token: await this.serializer.deserialize(dbHistory[uuid])
                })
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to read token", { instanceId, e });
            throw new Error("DB: failed to read token", e);
        }
    }

    calculateTimeBlock({ time }) {
        // one timeblock per minute - cut milliseconds and seconds
        return new Date(time.toISOString().replace(/:\d+.\d+Z$/g, ":00Z"));
    }

    addMinutes(minutes, date = new Date()) {
        const dateCopy = new Date(date.getTime());
        dateCopy.setMinutes(dateCopy.getMinutes() + minutes);
        return dateCopy;
    }

    calculateNextTimeBlock({ time }) {
        // add 1 minute
        return this.addMinutes(1,time);
    }

    async scheduleToken({ time, timer = null, token }) {
        try {
            // serialize payload
            const payload = JSON.stringify({ timer, token });                
            // insert db            
            let query = "INSERT INTO " + this.timerTable + " (day,timeblock,id,time,payload) VALUES (:timeblock,:timeblock,:id,:time,:payload);";
            // ( day date, time timestamp, id uuid, payload varchar, runner uuid, fetched timestamp, ack timestamp, PRIMARY KEY ((day), time, id) )
            let params = { 
                timeblock: this.calculateTimeBlock({ time }),  // just minutes
                time,
                id: uuid(), 
                payload
            };
            await this.cassandra.execute(query, params, {prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to insert scheduled token", { time, cycle, token, e });
            throw new Error("DB: failed to insert scheduled token", e);
        }
    }

    async readScheduledToken({ time }) {
        try {
            let query = "SELECT id, time, payload FROM " + this.timerTable + " WHERE day = :day AND timeblock = :timeblock;";
            let params = {
                day: time,
                timeblock: this.calculateTimeBlock({ time })
            }
            let result = await this.cassandra.execute(query, params, {prepare: true});
            let returnValue = [];
            for (const row of result) {
                returnValue.push({
                    id: row.get("id").toString(),
                    time: row.get("time"),
                    payload: JSON.parse(row.get("payload"))
                })
            }
            return returnValue;
        }catch (e) {
            this.logger.warn("DB: failed to retrieve scheduled token", { time, e });
            throw new Error("DB: failed to retrieve scheduled token", e);
        }
    }

    async fetchScheduledToken({ time, runner, callback }) {
        try {
            // 1. update runner table to allocate timeblock      
            let query = "INSERT INTO " + this.runnerTable + " (day,timeblock,runner,fetched) VALUES (:day,:timeblock,:runner,toTimestamp(now())) IF NOT EXISTS;";
            let params = { 
                day: time,
                //day: time.toISOString().split('T')[0],
                timeblock: this.calculateTimeBlock({ time }),  // just minutes
                time,
                runner
            };
            let result = await this.cassandra.execute(query, params, {prepare: true});
            let row = result.first();
            if (row) {
                let applied = row.get("[applied]");
                // 2. if successfully allocated, fetch timeblock           
                if (applied) {
                    query = "SELECT id, time, payload FROM " + this.timerTable + " WHERE day = :day AND timeblock = :timeblock;";
                    await new Promise(async (resolve, reject) => { 
                        this.cassandra.stream(query, params, {prepare: true, fetchSize: 1000 })
                            .on("readable", async function () {
                                let row;
                                while ((row = this.read()) !== null ) {
                                    let value = {
                                        id: row.get("id").toString(),
                                        time: row.get("time"),
                                        payload: JSON.parse(row.get("payload"))
                                    };
                                    await callback(value);
                                }   
                            })
                            .on("end", async function () {
                                resolve()
                            })
                            .on("error", function (err) {
                                reject(err);
                            })
                    });
                    // 3. confirm fetched time block
                    query = "UPDATE " + this.runnerTable + " SET confirmed = toTimestamp(now()) WHERE day = :day AND timeblock = :timeblock;";
                    await this.cassandra.execute(query, params, {prepare: true});
                }
            }
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to fetch scheduled token", { time, runner, e });
            throw new Error("DB: failed to fetch scheduled token", e);
        }
    }

    async getScheduleStatus({ time }) {
        try {
            let query = "SELECT timeblock,runner,fetched,confirmed FROM " + this.runnerTable + " WHERE day = :day ORDER BY timeblock;";
            let params = { 
                day: time,
                time
            };
            let result = await this.cassandra.execute(query, params, {prepare: true});
            let returnValue = [];
            for (const row of result) {
                returnValue.push({
                    timeblock: row.get("timeblock"),
                    runner: row.get("runner").toString(),
                    fetched: row.get("fetched"),
                    confirmed: row.get("confirmed"),
                })
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to query runner table", { time, e });
            throw new Error("DB: failed to query runner table", e);
        }
    }

    /** called in service created */
    async init () {

    }

    /** called in service started */
    async connect () {

        // connect to cassandra cluster
        await this.cassandra.connect();
        this.logger.info("Connected to cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });
        
        // create tables, if not exists
        let query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.contextTable} `;
        query += " ( owner varchar, instance uuid, key varchar, value varchar, oek uuid, iv varchar, PRIMARY KEY (owner,instance,key) ) ";
        query += " WITH comment = 'storing process context';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.instanceTable} `;
        query += " ( owner uuid, process uuid, version uuid, instance uuid, created timestamp, PRIMARY KEY (owner,process,version,instance) ) ";
        query += " WITH comment = 'storing process instances';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.runningTable} `;
        query += " ( owner uuid, process uuid, version uuid, instance uuid, started timestamp, PRIMARY KEY (owner,process,version,instance) ) ";
        query += " WITH comment = 'storing running instances';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.completedTable} `;
        query += " ( owner uuid, process uuid, version uuid, instance uuid, finished timestamp, PRIMARY KEY (owner,process,version,instance,finished) ) ";
        query += " WITH comment = 'storing completed instances';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.failedTable} `;
        query += " ( owner uuid, process uuid, version uuid, instance uuid, finished timestamp, PRIMARY KEY (owner,process,version,instance,finished) ) ";
        query += " WITH comment = 'storing failed instances';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.tokenTable} `;
        query += " ( owner varchar, instance uuid, active set<text>, history map<timeuuid,text> ,PRIMARY KEY (owner,instance) ) ";
        query += " WITH comment = 'storing instance token';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.versionTable} `;
        query += " ( owner uuid, process uuid, version uuid, deployed timestamp, attributes varchar, xml varchar, parsed varchar, oek uuid, iv varchar, PRIMARY KEY (owner,process,version,deployed) ) ";
        query += " WITH comment = 'storing process versions';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.subscriptionTable} `;
        query += " ( owner uuid, event varchar, process uuid, version uuid, element uuid, data varchar, oek uuid, iv varchar, PRIMARY KEY (owner,event,process,version,element) ) ";
        query += " WITH comment = 'storing event subscriptions';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.activeTable} `;
        query += " ( owner uuid, active map<uuid,uuid>, PRIMARY KEY (owner) ) ";
        query += " WITH comment = 'storing active process versions';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.timerTable} `;
        query += " ( day date, timeblock timestamp, id uuid, time timestamp, payload varchar, PRIMARY KEY ((day), timeblock, id) ) ";
        query += " WITH comment = 'storing scheduled tokens';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.runnerTable} `;
        query += " ( day date, timeblock timestamp, runner uuid, fetched timestamp, confirmed timestamp, PRIMARY KEY ((day), timeblock) ) ";
        query += " WITH comment = 'storing processing of scheduled tokens';";
        await this.cassandra.execute(query);

    }
    
    /** called in service stopped */
    async disconnect () {

        // close all open connections to cassandra
        await this.cassandra.shutdown();
        this.logger.info("Disconnected from cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });
        
    } 

    /** Database specfic methods */
    async _getKey ({ opts = null, id = null } = {}) {
        
        let result = {};
        
        // try to retrieve from keys service
        let params = { 
            service: this.name
        };
        if ( id ) params.id = id;
        
        // call key service and retrieve keys
        try {
            this.logger.info("call key service", { name: this.services.keys, params, opts });
            result = await this.broker.call(this.services.keys + ".getOek", params, { meta: opts });
            this.logger.debug("Got key from key service", { id });
        } catch (err) {
            this.logger.error("Failed to receive key from key service", { id, opts });
            throw err;
        }
        if (!result.id || !result.key) throw new Error("Failed to receive key from service", { result });
        return result;
    }
    
    _encrypt ({ value = ".", secret, iv }) {
        let cipher = crypto.createCipheriv("aes-256-cbc", secret, iv);
        let encrypted = cipher.update(value, "utf8", "hex");
        encrypted += cipher.final("hex");
        return encrypted;
    }

    _decrypt ({ encrypted, secret, iv }) {
        let decipher = crypto.createDecipheriv("aes-256-cbc", secret, iv);
        let decrypted = decipher.update(encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;            
    }
    
    _getHash(value) {
        return crypto.createHash("sha256")
            .update(value)
            .digest("hex");
    }

    _getDateFromUuid(uuid) {
        const get_time_int = function (uuid_str) {
            var uuid_arr = uuid_str.split( '-' ),
                time_str = [
                    uuid_arr[ 2 ].substring( 1 ),
                    uuid_arr[ 1 ],
                    uuid_arr[ 0 ]
                ].join( '' );
            return parseInt( time_str, 16 );
        };
    
        const get_date_obj = function (uuid_str) {
            var int_time = get_time_int( uuid_str ) - 122192928000000000,
                int_millisec = Math.floor( int_time / 10000 );
            return new Date( int_millisec );
        };
        return  get_date_obj(uuid);   
    }
};

module.exports = {
    DB
};
