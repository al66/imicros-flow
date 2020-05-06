# imicros-flow
[![Build Status](https://travis-ci.org/al66/imicros-flow.svg?branch=master)](https://travis-ci.org/al66/imicros-flow)
[![Coverage Status](https://coveralls.io/repos/github/al66/imicros-flow/badge.svg?branch=master)](https://coveralls.io/github/al66/imicros-flow?branch=master)

Process engine of imicros framework (based on [Moleculer](https://github.com/moleculerjs/moleculer) services)

## Installation
```
$ npm install imicros-flow --save
```
## Dependencies
The engine requires additional running services of the following packages: 
- imicros-streams
- imicros-flow-control
- imicros-flow-context

These packages/services requires an infrastructure of data stores  
- [Kafka](https://kafka.apache.org/) broker for the event queue: events thrown by Moleculer services are stored persistent by imicros-events middleware in the event queue and consumed by imicros-flow.
- [Neo4j](https://neo4j.com/) node/cluster as graph database for the process definition.
- [Redis](https://redis.io/) node/cluster. Redis streams is used for process token queues and handling.
- [Cassandra](https://cassandra.apache.org/) node/cluster for storing the context of process instances.

