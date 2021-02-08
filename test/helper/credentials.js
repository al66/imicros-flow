const { v4: uuid } = require("uuid");

const credentials = {
    ownerId: uuid(),
    adminGroupId: uuid(),
    serviceId: uuid(),
    authToken: "this is the super secret service authorization token",
    serviceToken: "this is the emitted service token - emitted by agents",
    grantToken: "this is the grantToken emitted by the acl service and passed through by the agent service",
    accessToken: "this is the access token"
};

// service authentifcation
process.env.SERVICE_ID = credentials.serviceId;
process.env.SERVICE_AUTH_TOKEN = credentials.authToken;
// admin group ID
process.env.ADMIN_GROUP_ID = credentials.adminGroupId;

module.exports = {
    credentials
};
