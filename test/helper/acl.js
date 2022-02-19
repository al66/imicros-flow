const { credentials } = require("./credentials");

class User {
    constructor () {
        let timestamp = Date.now();
        return {
            id: `1-${timestamp}` , 
            email: `1-${timestamp}@host.com`
        };
    }
}

const user = new User();
const meta = {
    ownerId: credentials.ownerId,
    acl: {
        accessToken: credentials.accessToken,
        ownerId: credentials.ownerId
    }, 
    user: user
}; 

// mock service acl
const ACL = {
    name: "acl",
    actions: {
        verify: {
            params: {
                token: { type: "string" }
            },
            async handler(ctx) {
                this.logger.info("acl.verified called", { params: ctx.params, meta: ctx.meta } );
                if ( ctx.params.token === credentials.accessToken ) {
                    return { 
                        acl: {
                            accessToken: ctx.params.token,
                            ownerId: ctx.meta.ownerId || credentials.ownerId,
                            role: "member",
                            unrestricted: true
                        } 
                    };
                } else {
                    throw new Error("acl.verified failed", { params: ctx.params, meta: ctx.meta });
                } 
            }
        }
    }
};

// mock acl middleware
const AclMiddleware = {
    localAction(next, action) {
        return async function(ctx) {
            ctx.meta = Object.assign(ctx.meta,{
                ownerId,
                acl: {
                    accessToken: "this is the access token",
                    ownerId,
                    unrestricted: true
                },
                user
            });
            ctx.broker.logger.debug("ACL meta data has been set", { meta: ctx.meta, action: action });
            return next(ctx);
        };
    }    
};

module.exports = {
    user,
    meta,
    ACL,
    AclMiddleware
};
