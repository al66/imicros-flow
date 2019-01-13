/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const dbMixin       = require("./db.neo4j");

module.exports = {
    name: "flow.control",
    mixins: [dbMixin],
    
    /**
	   * Service settings
	   */
    settings: {
        /*
        topic: "events"
        */
    },

    /**
	   * Service metadata
	   */
    metadata: {},

    /**
	   * Service dependencies
	   */
    //dependencies: [],	

    /**
     * Actions
     */
    actions: {

        addNext: {
            params: {
                listen: { 
                    type: "object", 
                    props: {
                        name: { type: "string", empty: false },
                        owner: { 
                            type: "object",
                            props: {
                                type: { type: "string"},
                                id: { type: "string" }
                            },
                            optional: true    
                        },
                        process: { type: "string", optional: true },
                        step: { type: "string", optional: true }
                    }
                },
                task: { 
                    type: "object",
                    props: {
                        process: { type: "string", empty: false },
                        step: { type: "string", empty: false },
                        owner: { 
                            type: "object",
                            props: {
                                type: { type: "string"},
                                id: { type: "string" }
                            }    
                        },
                        service: { type: "string", empty: false },
                        action: { type: "string", empty: false },
                        map: { type: "object", optional: true }                    }
                },
                done: {
                    type: "object",
                    props: {
                        name: { type: "string", empty: false }
                    },
                    optional: true
                },
                error: {
                    type: "object",
                    props: {
                        name: { type: "string", empty: false }
                    },
                    optional: true
                }
                
            },
            async handler(ctx) {
                let params = {
                    listenEvent: ctx.params.listen.name,
                    listenOwnerType: ctx.params.listen.owner.type,
                    listenOwnerId: ctx.params.listen.owner.id,
                    listenProcess: ctx.params.listen.process,
                    listenStep: ctx.params.listen.step,
                    taskProcess: ctx.params.task.process,
                    taskStep: ctx.params.task.step,
                    taskOwnerType: ctx.params.task.owner.type,
                    taskOwnerId: ctx.params.task.owner.id,
                    taskService: ctx.params.task.service,
                    taskAction: ctx.params.task.action,
                    taskMap: ctx.params.task.map ? JSON.stringify(ctx.params.task.map) : ".",
                    doneEvent: ctx.params.done ? ctx.params.done.name : "END",
                    errorEvent: ctx.params.error ? ctx.params.error.name : "END"
                };
                let statement = "MERGE (e:Event { name: {listenEvent}, ownerType: {listenOwnerType}, ownerId: {listenOwnerId} }) ";
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
        }
    },

    /**
     * Events
     */
    events: {},

    /**
	   * Methods
	   */
    methods: {},

    /**
     * Service created lifecycle event handler
     */
    created() {},

    /**
	   * Service started lifecycle event handler
	   */
    started() {},

    /**
	   * Service stopped lifecycle event handler
	   */
    stopped() {}
};