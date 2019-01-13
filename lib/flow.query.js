/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const dbMixin       = require("./db.neo4j");

module.exports = {
    name: "flow.query",
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


        next: {
            params: {
                event: { 
                    type: "object", 
                    props: {
                        name: { type: "string", empty: false },
                        owner: { 
                            type: "object",
                            props: {
                                type: { type: "string"},
                                id: { type: "string" }
                            }    
                        },
                        process: { type: "string", optional: true },
                        step: { type: "string", optional: true }
                    }
                }                
            },
            async handler(ctx) {
                let params = {
                    listenEvent: ctx.params.event.name,
                    listenOwnerType: ctx.params.event.owner.type || "",
                    listenOwnerId: ctx.params.event.owner.id || "",
                    listenProcess: ctx.params.event.process || "",
                    listenStep: ctx.params.event.step || ""
                };
                let statement = "MATCH (e:Event { name: {listenEvent}, ownerType: {listenOwnerType}, ownerId: {listenOwnerId} }) ";
                statement += "MATCH (e)-[n:NEXT { process: {listenProcess}, step: {listenStep} }]->(t) ";
                statement += "MATCH (t)-[c:DONE]->(done:Event) ";
                statement += "MATCH (t)-[:ERROR]->(error:Event) ";
                statement += "RETURN { process: t.process,  step: t.step, service: t.service, action: t.action, map: n.map, ownerType: t.ownerType, ownerId: t.ownerId } AS task, ";
                statement += "{ event: done.name } AS onDone, ";
                statement += "{ event: error.name } AS onError;";
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