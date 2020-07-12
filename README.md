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
The services `flow.token`, `flow.next`, `flow.activity`, `flow.sequence`, `flow.gateway` are running worker services reacting on different events (namespace `flow.*`).

New processes are triggered by event subscriptions defined in process control and queried by service `flow.query` / action `subscripitions`.
Service `flow.event` is listening to each* submitted event in molculer and starts a new process if a subscription exsits.

* with exception of internal events `$**` or own submitted events `flow.*`.

## Dependencies
The engine requires additional running services of the following packages: 
- imicros-flow-control (service `flow.query`) for querying process defintion uses [Neo4j](https://neo4j.com/) as graph database
- imicros-flow-context (service `flow.context`) for storing the context of a running process uses [Cassandra](https://cassandra.apache.org/) as database
- imicros-acl (service `acl`) for checking authorizations
- imicros-rules (service `rules`) for evaluation business rules

But these services can also be replaced by own services with similar functionality - refer to the mocks in test/helper.

## BPMN Background 

### Support of the following [BPMN elements](https://www.bpmnquickguide.com/view-bpmn-quick-guide/) 
The goal is to cover all of them in the final version :wink:.

#### Activites

Activities  |  Types  |  Markers  
----------- | ------- | ---------
Task        | [ ] Send Task  <br/> [ ] Receive Task <br/> [ ] User Task <br/> [ ] Manual Task <br/> [x] Business Rule Task <br/> [x] Service Task <br/> [ ] Script Task | [ ] Parallel <br/> [ ] Sequential <br/> [ ] Ad Hoc  
Sub-Process  |         | [ ] Loop <br/> [ ] Parallel <br/> [ ] Sequential <br/> [ ] Ad Hoc <br/> [ ] Compensation
Event Sub-Process  |         | [ ] Loop <br/> [ ] Parallel <br/> [ ] Sequential <br/> [ ] Ad Hoc <br/> [ ] Compensation
Transaction  |         | [ ] Loop <br/> [ ] Parallel <br/> [ ] Sequential <br/> [ ] Compensation

#### Sequence Flow
- [x] Standard Flow
- [ ] Conditional Flow
- [ ] Default Flow

#### Gateways
- [ ] Exclusive Gateway
- [ ] Event-based Gateway
- [ ] Parallel Gateway
- [ ] Inclusive Gateway
- [ ] Complex Gateway
- [ ] Exclusive Event-based Gateway
- [ ] Parallel Event-based Gateway

#### Events

Events         | Start                    | Intermediate             | End
-------------- | ------------------------ | ------------------------ | ------------------------
None (untyped) | [x] Standard  | [ ] Throwing | [ ] Standard <br/> [ ] Terminate Immediatly
Message        | [ ] Standard <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting | [ ] Catching <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting <br/> [ ] Throwing | [ ] Standard
Timer          | [ ] Standard <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting | [ ] Catching <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting | 
Escalation     | [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting | [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting  [ ] Throwing | [ ] Standard
Conditional    | [ ] Standard <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting | [ ] Catching <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting | 
Error          | [ ] Boundary Interrupting | [ ] Boundary Interrupting | [ ] Standard
Cancel         |  | [ ] Boundary Interrupting | [ ] Standard
Compensation   | [ ] Boundary Interrupting | [ ] Boundary Interrupting <br/> [ ] Throwing | [ ] Standard
Signal         | [ ] Standard <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting | [ ] Catching <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting <br/> [ ] Throwing | [ ] Standard
Multiple       | [ ] Standard <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting | [ ] Catching <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting <br/> [ ] Throwing | [ ] Standard
Parallel Multiple  | [ ] Standard <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting | [ ] Catching <br/> [ ] Boundary Interrupting <br/> [ ] Boundary Non-Interrupting | 


### Concept of token
According to [BPMN Execution Semantics](https://www.omg.org/spec/BPMN/2.0/PDF/):

The process flow of each instance is controlled by token. If a new process element (event, sequence, task, gateway or subprocess) is activated, a corresponding token with an initial status is emitted (event `flow.token.emit`). 

The token handler is reading the emitted tokens will initiate the next step by processing the token.

If the token is processed, at least the status changes. The processed token is consumed (event `flow.token.consume`) and new tokens are issued.
