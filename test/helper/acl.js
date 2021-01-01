const { v4: uuid } = require("uuid");

class User {
    constructor () {
        let timestamp = Date.now();
        return {
            id: `1-${timestamp}` , 
            email: `1-${timestamp}@host.com`
        };
    }
}

const accessToken = "this is the access token";
const user = new User();
const ownerId = uuid();
const meta = {
    ownerId: ownerId,
    acl: {
        accessToken: accessToken,
        ownerId: ownerId
    }, 
    user: user
}; 
const serviceToken = process.env.SERVICE_TOKEN;

// mock service acl
const ACL = {
    name: "acl",
    actions: {
        requestAccess: {
            params: {
                forGroupId: { type: "string" }
            },			
            async handler(ctx) {
                this.logger.info("acl.requestAccess called", { params: ctx.params, meta: ctx.meta } );
                if (ctx.meta.user.id === meta.user.id && ( ctx.meta.ownerId === meta.ownerId || ctx.meta.serviceToken === serviceToken)) return { token: accessToken }; 
                return false;
            }
        },
        verify: {
            params: {
                token: { type: "string" }
            },
            async handler(ctx) {
                this.logger.info("acl.verified called", { params: ctx.params, meta: ctx.meta } );
                if ( ctx.params.token === accessToken ) {
                    return { 
                        acl: {
                            accessToken: ctx.params.token,
                            ownerId: ctx.meta.ownerId,
                            role: "admin",
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

module.exports = {
    user: user,
    ownerId: ownerId,
    meta: meta,
    accessToken: accessToken,
    serviceToken: serviceToken,
    ACL: ACL
};
