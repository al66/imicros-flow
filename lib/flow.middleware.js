/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const Connector = require("./connector/neo4j");
const _ = require("lodash");

const uuidV4 = require("uuid/v4");

module.exports = {
	// After broker is created
    async created(broker) {

        // set flow options
        /*
        flow: {
            uri: "bolt://localhost:7474",
            user: "neo4j",
            password: "neo4j"
        }
        */
        broker.flow = {
            id: uuidV4(),
            options: {
                uri: _.get(this.options,"flow.uri","bolt://localhost:7474"),
                user: _.get(this.options,"flow.user","neo4j"),
                password: _.get(this.options,"flow.password","neo4j"),
            }
        };
        broker.flow.connector = new Connector(broker, broker.flow.options);
        
    },

    // Wrap local action calls (legacy middleware handler)
    localAction(handler, action) {
        return async function(ctx) {
            ctx.broker.logger.debug("MW localAction is fired.", { action: action.name, meta: ctx.meta });
            try {
                let res = await handler(ctx);
                if (ctx.meta && ctx.meta.onDone && ctx.meta.onDone.event && ctx.meta.owner) {
                    let meta = ctx.meta;
                    await ctx.broker.emit(ctx.meta.onDone.event, res, null, meta);
                }
                return res;
            } catch (err) {
                if (ctx.meta && ctx.meta.onError && ctx.meta.onError.event && ctx.meta.owner) {
                    let meta = ctx.meta;
                    await ctx.broker.emit(ctx.meta.onError.event, { error: err }, null, meta);
                }
                throw err;
            }
        };
    },

    
    // Wrap broker.createService method
    createService(next) {
        return function() {
            this.logger.debug("MW createService is fired.");
            return next(...arguments);
        };
    },

    // Wrap broker.destroyService method
    destroyService(next) {
        return function() {
            this.logger.debug("MW destroyService is fired.");
            return next(...arguments);
        };
    },

    // When event is emitted
    emit(next) {
        return async function emitter(eventName, payload, groups, meta) {            
            
            // Check if event starts with name of local service
            let services = this.flow.connector.getServiceNames();
            let valid = services.reduce((result, service) => { return (eventName.startsWith(service) ? true : result);},false);
            if (valid) {

                /*
                 * Store payload to context
                 */
                if (payload && meta && meta.context &&  meta.context.store ) {
                    //TODO call flow.store.add with key = <process>.<step> and value = res
                }
                
                // Emit event
                try {
                    await this.flow.connector.emit(eventName, payload, meta);
                    this.logger.debug(`Emitted event ${eventName}`, { meta: meta });
                } catch (err) {
                    this.logger.error(`Failed to emit event ${eventName}`, { meta: meta });
                    throw err;
                }

            } else {
                this.logger.debug(`Emitted event ${eventName} ignored`, { meta: meta });
            }
            
            // Call default handler
            return next(eventName, payload, groups);
        };
    },

    // When broadcast event is emitted
    broadcast(next) {
        return function(eventName, payload, groups) {
            this.logger.debug("MW broadcast is fired.", { eventName: eventName, payload: payload });
            return next(eventName, payload, groups);
        };
    },

    // When local broadcast event is emitted
    broadcastLocal(next) {
        return function(eventName, payload, groups) {
            this.logger.debug("MW broadcastLocal is fired.", { eventName: eventName, payload: payload });
            return next(eventName, payload, groups);
        };
    },

    // After a new local service created
    serviceCreated(service) {
        this.logger.debug("MW serviceCreated is fired.", { serviceName: service.name });
    },

    // After a local service started
    async serviceStarted(service) {
        this.logger.debug("MW serviceStarted is fired.", { serviceName: service.name });
        this.flow.connector.startService(service);
        
    },

    // After a local service stopped
    serviceStopped(service) {
        this.logger.debug("MW serviceStopped is fired.", { serviceName: service.name });
        this.flow.connector.stopService(service);
    },

    // Before broker starting
    async starting(broker) {
        
        // connect to database
        await broker.flow.connector.connect();
        this.logger.info("Middleware flow connected to database " + broker.flow.options.uri);

        // start worker
        let loop = () => {
            broker.flow.running = true;
            broker.flow.connector.work().then(() => { 
                if (broker.flow.pause) {
                    broker.flow.running = false;
                    return;
                }
                if (broker.flow.running) setImmediate(loop); 
            });
        };
        loop();        
        
    },

    // After broker started
    started(broker) {
        this.logger.debug("MW started (broker) is fired.", { id: broker.flow.id });
    },

    // Before broker stopping
    async stopping(broker) {

        // stop worker
        async function stop () {
            broker.flow.pause = true;
            return new Promise((resolve) => {
                let check = () => {
                    if (broker.flow.running) {
                        setTimeout(check,10); 
                        return;
                    } else {
                        return resolve();   
                    }
                };
                check();
            });
        }
        await stop();

        // disconnect from database
        await broker.flow.connector.disconnect();
        
        this.logger.info("Middleware flow disconnectied from database " + broker.flow.options.uri);
    },

    // After broker stopped
    stopped(broker) {
        this.logger.debug("MW stopped (broker) is fired.", { id: broker.flow.id });
    }
    
};