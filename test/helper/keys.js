"use strict";
const { v4: uuid } = require("uuid");
const { credentials } = require("./credentials");

const keys = {
    current: uuid(),
    previous: uuid()
};

// mock keys service
const Keys = {
    name: "keys",
    version: 1,
    actions: {
        getOek: {
            handler(ctx) {
                this.logger.info("keys.getOek called", { params: ctx.params, meta: ctx.meta } );
                if (ctx.meta.ownerId !== credentials.ownerId || ctx.meta.acl.ownerId !== credentials.ownerId) throw new Error("Wrong owner");
                if (ctx.meta.acl.accessToken !== credentials.accessToken) throw new Error("Wrong access token");
                if (!ctx.params || !ctx.params.service) throw new Error("Missing service name");
                if ( ctx.params.id == keys.previous ) {
                    return {
                        id: keys.previous,
                        key: "myPreviousSecret"
                    };    
                }
                return {
                    id: keys.current,
                    key: "mySecret"
                };
            }
        }
    }
};

module.exports = {
    Keys
};