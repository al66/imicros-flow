process.env.SERVICE_TOKEN = "myServiceSecretRegisteredAtACLService";

/* Jest config */
module.exports = {
    testPathIgnorePatterns: ["/dev/"],
    coveragePathIgnorePatterns: ["/node_modules/","/dev/","/test/"]
};