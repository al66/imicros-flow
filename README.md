# imicros-flow
[![Build Status](https://travis-ci.org/al66/imicros-flow.svg?branch=master)](https://travis-ci.org/al66/imicros-flow)
[![Coverage Status](https://coveralls.io/repos/github/al66/imicros-flow/badge.svg?branch=master)](https://coveralls.io/github/al66/imicros-flow?branch=master)
[![Development Status](https://img.shields.io/badge/status-under_development-red)](https://img.shields.io/badge/status-under_development-red)

Process engine of imicros framework (based on [Moleculer](https://github.com/moleculerjs/moleculer) services)

> ** Change in Version 0.3.*: Eventhandling based on Kafka moved to imicros-events! **   

## Installation
```
$ npm install imicros-flow --save
```
## Dependencies
The engine requires additional running services of the following packages: 
- imicros-flow-control for process defintion uses Neo4j as graph database
- imicros-flow-context for storing the context of a running process uses Cassandra as database
- imicros-streams as token queue based on Redis streams
- imicros-events as persistent event queue nased on Kafka 

These packages/services requires an infrastructure of data stores  
- [Kafka](https://kafka.apache.org/) broker for the event queue: events thrown by Moleculer services are stored persistent by imicros-events middleware in the event queue and consumed by imicros-flow.
- [Neo4j](https://neo4j.com/) node/cluster.
- [Redis](https://redis.io/) node/cluster.
- [Cassandra](https://cassandra.apache.org/) node/cluster.

## Concept of token (according to [BPMN Execution Semantics](https://www.omg.org/spec/BPMN/2.0/PDF/))
The process flow of each instance is controlled by token. If a new process element (event, sequence, task, gateway or subprocess) is activated, a corresponding token with an initial status is saved in the instance context and emitted to the token stream. 

The token handler is reading the emitted tokens from the token stream and will initiate the next step by processing the token.

If the token is processed, at least the status changes.The processed token and related stored tokens are consumed and new tokens are issued.
The processed token is replaced from the stream (also if processing has failed) but may remain stored in the context for further processing.

### Attributes of a token
- process ID : unique id of the process definition
- instance ID : unique id of the instance, created at process start
- element ID : unique id of the process element (event, sequence, task, gateway or subprocess)
- type : type of the process element
- status : status of the current step
- user: user who has started the process (saved at process start in the initial token)
- ownerId: owner group according to access token at process start
