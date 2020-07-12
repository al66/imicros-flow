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

## Usage


## Dependencies
The engine requires additional running services of the following packages: 
- imicros-flow-control for process defintion uses Neo4j as graph database
- imicros-flow-context for storing the context of a running process uses Cassandra as database

These packages/services requires an infrastructure of data stores  
- [Neo4j](https://neo4j.com/) node/cluster.
- [Cassandra](https://cassandra.apache.org/) node/cluster.

## Support of the following BPMN elements 

### Activites
- [x] Task
- [ ] Transaction
- [ ] Event Sub-Process
- [ ] Call Activity

#### Task Types
- [ ] Send Task
- [ ] Receive Task
- [ ] User Task
- [ ] Maunal Task
- [x] Business Rule Task
- [x] Service Task
- [ ] Script Task

### Gateways
- [ ] Exclusive Gateway
- [ ] Event-based Gateway
- [ ] Parallel Gateway
- [ ] Inclusive Gateway
- [ ] Complex Gateway
- [ ] Exclusive Event-based Gateway
- [ ] Parallel Event-based Gateway

### Events
Events         | Start                                                   | Intermediate  | End
-------------- | ------------------------------------------------------- | ------------- | --------
               | Standard        |  Interrupting    |  Non-interrupting  |               |
-------------- | --------------- | ---------------- | ------------------ | ------------- | --------
None (untyped) |   - [x]         |


- [x] Start Event
- [ ] Intermediate Event
- [x] End Event
#### Event Types
- [x] Untyped
- [ ] Message
- [ ] Timer
- [ ] Intermediate Event
- [ ] Intermediate Event
- [ ] Intermediate Event
- [ ] Intermediate Event
- [ ] Intermediate Event


## Concept of token
According to [BPMN Execution Semantics](https://www.omg.org/spec/BPMN/2.0/PDF/):

The process flow of each instance is controlled by token. If a new process element (event, sequence, task, gateway or subprocess) is activated, a corresponding token with an initial status is emitted (event `flow.token.emit`). 

The token handler is reading the emitted tokens will initiate the next step by processing the token.

If the token is processed, at least the status changes. The processed token is consumed (event `flow.token.consume`) and new tokens are issued.
