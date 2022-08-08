process.env.CASSANDRA_CONTACTPOINTS = "192.168.2.124";
process.env.CASSANDRA_DATACENTER = "datacenter1";
process.env.CASSANDRA_KEYSPACE_FLOW = "imicros_flow";
process.env.CASSANDRA_PORT = 31326;
process.env.CASSANDRA_USER = "cassandra";
process.env.CASSANDRA_PASSWORD = "cassandra";

/* Jest config */
module.exports = {
    testPathIgnorePatterns: ["/dev/"],
    coveragePathIgnorePatterns: ["/node_modules/","/dev/","/test/"]
};

