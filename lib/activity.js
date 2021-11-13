/**
 * @license MIT, imicros.de (c) 2020 Andreas Leinen
 */
"use strict";

const { Constants } = require("imicros-flow-control");
const { map } = require("imicros-flow-map");
const Base = require("./base");
const _ = require("./util/lodash");

/** Events **/
// flow.activity.* { token } => true

module.exports = {
    name: "flow.activity",
    
    mixins: [Base],
    
    /**
     * Service settings
     */
    settings: {
        /*
        services: {
            context: "flow.context",
            query: "flow.query",
            acl: "acl",
        }
        */        
    },

    /**
     * Service metadata
     */
    metadata: {},

    /**
     * Service dependencies
     */
    //dependencies: ["flow.query","flow.context","acl"],	

    /**
     * Actions
     */
    actions: {
        
        /**
         * activity ready
         * 
         * @actions
         * @param {Object} token
         * 
         * @returns {Boolean} true
         */
        completed: {
            acl: "before",
            params: {
                token: { 
                    type: "object",
                    props: {
                        processId: { type: "uuid" },
                        versionId: { type: "uuid" },
                        instanceId: { type: "uuid" },
                        elementId: { type: "uuid", optional: true },
                        type: { type: "string" },
                        status: { type: "string" },
                        user: { type: "object" },
                        ownerId: { type: "string" },
                        attributes: { type: "object", optional: true}
                    }
                },
                result: { type: "any", optional: true },
                error: { type: "object", optional: true }
            },
            async handler({ params: { token, result = null, error = null }}) {
                return this.handleCompleted({ token, result, error });
            }
        }        
        
    },

    /**
     * Events
     */
    events: { 

        "flow.token.emit": {
            params: {
                token: { 
                    type: "object",
                    props: {
                        processId: { type: "uuid" },
                        versionId: { type: "uuid" },
                        instanceId: { type: "uuid" },
                        elementId: { type: "uuid", optional: true },
                        type: { type: "string" },
                        status: { type: "string" },
                        user: { type: "object" },
                        ownerId: { type: "string" },
                        attributes: { type: "object", optional: true}
                    }
                }
            },
            handler(ctx) {
                this.handle({ token: ctx.params.token });
            }
        }
        
    },

    /**
     * Methods
     */
    methods: {
        
        async handle({ token }) {
            switch ( token.status ) {
                case Constants.ACTIVITY_ACTIVATED:
                    // get activity attributes and evaluate start conditions
                    // if start conditions evaluate to true emit ready token
                    await this.prepareActivity({ token });
                    break;
                case Constants.ACTIVITY_READY:
                    // get activity attributes and execute activity
                    // if executed w/o errors emit completed token
                    await this.startActivity({ token });
                    break;
                case Constants.ACTIVITY_COMPLETED:
                    // nothing todo
                    break;
                default:
                    // ignore token
            }            
        },
        
        async prepareActivity({ token }) {
            let opts = await this.getOpts({ token });
            // prepare activity
            let activity = await this.getElement({ token, opts });
            if (!activity) {
                this.logger.error("missing element", { token });
                await this.consume({ token, opts });
                return null;
            }
            
            this.logger.debug("prepare activity", {activity, token});
            switch ( activity.type ) {
                case Constants.SERVICE_TASK:
                    await this.prepareServiceTask({ token, activity, opts });
                    break;
                default: {
                    let ready = _.cloneDeep(token);
                    ready.status = Constants.ACTIVITY_READY;
                    await this.consume({ token, opts });
                    await this.emit({ token: ready, opts });
                }
            }
        },
        
        async startActivity({ token }) {
            let opts = await this.getOpts({ token });
            // start activity 
            let activity = await this.getElement({ token, opts });
            if (!activity) {
                this.logger.error("missing element", { token });
                await this.consume({ token, opts });
                return null;
            }

            this.logger.info("start activity", { activity, token });
            if ( activity.type === Constants.SERVICE_TASK) {
                return this.startServiceTask({ token, activity, opts });
            }
            if ( activity.type === Constants.BUSINESS_RULE_TASK ) {
                return this.startBusinessRuleTask({ token, activity, opts });
            }

            await this.consume({ token, opts });
            return null;
        },
        
        async startServiceTask({ token, activity, opts }) {
            // execute action
            let action = activity?.attributes?.action ?? null;
            let serviceId = activity?.attributes?.serviceId ?? null;
            if (action) {
                try {
                    let paramsKey = activity?.attributes?.paramsKey ?? ".";
                    // get context
                    let params = await this.broker.call(this.services.context + ".get", { instanceId: token.instanceId, key: paramsKey }, opts);
                    let result = await this.broker.call(action, params, opts);
                    let contextKey = activity?.attributes?.resultKey ?? token.elementId;
                    // save result to context
                    if (result) {
                        await this.broker.call(this.services.context + ".add", { instanceId: token.instanceId, key: contextKey, value: result }, opts);
                    }
                    // if executed w/o errors emit completed token
                    let completed = _.cloneDeep(token);
                    completed.status = Constants.ACTIVITY_COMPLETED;
                    await this.consume({ token, opts });
                    await this.emit({ token: completed, opts });
                } catch (err) {
                    this.logger.info("Execution of service task failed", { error: err });
                    let failed = _.cloneDeep(token);
                    failed.status = Constants.ACTIVITY_ERROR;
                    await this.consume({ token, opts });
                    await this.emit({ token: failed, opts });
                }
            } else if (serviceId) {
                try {
                    let paramsKey = activity?.attributes?.paramsKey ?? ".";
                    // get context
                    let value = await this.broker.call(this.services.context + ".get", { instanceId: token.instanceId, key: paramsKey }, opts);
                    let result = await this.broker.call(this.services.queue + ".add", { serviceId, value, token }, opts);
                    if ( !result ) throw new Error("Failed to queue task for agent");
                } catch (err) {
                    this.logger.info("Execution of service task failed", { error: err });
                    let failed = _.cloneDeep(token);
                    failed.status = Constants.ACTIVITY_ERROR;
                    await this.consume({ token, opts });
                    await this.emit({ token: failed, opts });
                }
            }
            return true;
        },
        
        async prepareServiceTask({ token, activity, opts }) {
            // evaluate ruleset
            let prepFunction = activity?.attributes?.prepFunction ?? null;
            if (prepFunction && ["template","ruleset"].includes(prepFunction)) {
                try {
                    let keys = activity?.attributes?.contextKeys ?? [];
                    if (keys && !Array.isArray(keys)) keys = keys.split(",");
                    // get context
                    let context = await this.broker.call(this.services.context + ".getKeys", { instanceId: token.instanceId, keys: keys }, opts);
                    // prepare action parameters
                    // execute ruleset
                    let result;
                    switch (prepFunction) {
                        case "template":
                            {
                                let template = activity?.attributes?.template ?? null;
                                // expect base64 -> convert to string
                                template = Buffer.from(template, "base64").toString("ascii");
                                this.logger.debug("execute template", { template });
                                template = JSON.parse(template);
                                result = await map(template,context);
                                this.logger.debug("Parameter preparation in service task executed", { template, context, result });
                            }
                            break;
                        case "ruleset": 
                            {
                                let ruleset = activity?.attributes?.ruleset ?? null;
                                this.logger.debug("execute business rule", { ruleset });
                                result = await this.broker.call(this.services.rules + ".eval", { name: ruleset, data: context || {} }, opts);
                                this.logger.info("Parameter preparation in service task executed", { ruleset, context, result });
                            }
                            break;
                    }
                    let contextKey = activity?.attributes?.paramsKey ?? token.elementId;
                    // save result to context
                    if (result) {
                        await this.broker.call(this.services.context + ".add", { instanceId: token.instanceId, key: contextKey, value: result }, opts);
                        this.logger.info("Parameter preparation in service task saved", { instanceId: token.instanceId, key: contextKey, value: result, opts });
                    }
                    // if executed w/o errors emit completed token
                    let ready = _.cloneDeep(token);
                    ready.status = Constants.ACTIVITY_READY;
                    await this.consume({ token, opts });
                    await this.emit({ token: ready, opts });
                } catch (err) {
                    this.logger.info("Execution of parameter preparation rule failed", { error: err });
                    let failed = _.cloneDeep(token);
                    failed.status = Constants.ACTIVITY_ERROR;
                    await this.consume({ token, opts });
                    await this.emit({ token: failed, opts });
                }
            } else {
                let ready = _.cloneDeep(token);
                ready.status = Constants.ACTIVITY_READY;
                await this.consume({ token, opts });
                await this.emit({ token: ready, opts });
            }
            return true;
        },
        
        async startBusinessRuleTask({ token, activity, opts }) {
            // evaluate ruleset
            let ruleset = activity?.attributes?.ruleset ?? null;
            this.logger.info("execute business rule", { ruleset });
            if (ruleset) {
                try {
                    let keys = activity?.attributes?.contextKeys ?? [];
                    if (keys && !Array.isArray(keys)) keys = keys.split(",");
                    // get context
                    let context = await this.broker.call(this.services.context + ".getKeys", { instanceId: token.instanceId, keys: keys }, opts);
                    // prepare action parameters
                    let result = await this.broker.call(this.services.rules + ".eval", { name: ruleset, data: context || {} }, opts);
                    let contextKey = activity?.attributes?.contextKey ?? token.elementId;
                    // save result to context
                    if (result) {
                        await this.broker.call(this.services.context + ".add", { instanceId: token.instanceId, key: contextKey, value: result }, opts);
                    }
                    // if executed w/o errors emit completed token
                    let completed = _.cloneDeep(token);
                    completed.status = Constants.ACTIVITY_COMPLETED;
                    await this.consume({ token, opts });
                    await this.emit({ token: completed, opts });
                } catch (err) {
                    this.logger.debug("Execution of rule task failed", { error: err });
                    let failed = _.cloneDeep(token);
                    failed.status = Constants.ACTIVITY_ERROR;
                    await this.consume({ token, opts });
                    await this.emit({ token: failed, opts});
                }

            }
            return true;
        },
        
        async handleCompleted({ token, result, error }) {
            let opts = await this.getOpts({ token });
            // prepare activity
            let activity = await this.getElement({ token, opts });
            if (!activity) {
                this.logger.error("missing element", { token });
                await this.consume({ token, opts });
                return null;
            }
            
            this.logger.debug("agent activity completed", {activity, token});

            let contextKey = activity?.attributes?.contextKey ?? token.elementId;
            // save result to context
            if (result) {
                await this.broker.call(this.services.context + ".add", { instanceId: token.instanceId, key: contextKey, value: result }, opts);
            }
    
            // consume current token and emit completed token
            let newToken = _.cloneDeep(token);
            error ? newToken.status = Constants.ACTIVITY_ERROR : newToken.status = Constants.ACTIVITY_COMPLETED;
            await this.consume({ token, opts });
            await this.emit({ token: newToken, opts });
        }
        
    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 
    
        this.services = {
            context: this.settings?.services?.context ?? "flow.context",
            query: this.settings?.services?.query ?? "flow.query",
            acl: this.settings?.services?.acl ?? "acl",
            rules: this.settings?.services?.rules ?? "rules",
            agents: this.settings?.services?.agents ?? "agents",
            queue: this.settings?.services?.queue ?? "queue"
        };

        this.broker.waitForServices(Object.values(this.services));
        
    },
    /**
     * Service started lifecycle event handler
     */
    async started() {

        // login to agents service and retrieve token for service authentication at imicros-acl
        this.serviceId = process.env.SERVICE_ID;
        const authToken = process.env.SERVICE_AUTH_TOKEN;        
        const { serviceToken } = await this.broker.call(this.services.agents + ".login", { serviceId: this.serviceId, authToken});
        if (!serviceToken) throw new Error("failed to login service");
        this.serviceToken = serviceToken;

    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {}
    
};