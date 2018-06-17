# imicros-flow
[![Build Status](https://travis-ci.org/al66/imicros-flow.svg?branch=master)](https://travis-ci.org/al66/imicros-flow)
[![Coverage Status](https://coveralls.io/repos/github/al66/imicros-flow/badge.svg?branch=master)](https://coveralls.io/github/al66/imicros-flow?branch=master)

[Moleculer](https://github.com/moleculerjs/moleculer) service for loose coupled event handling

Ready to use as docker instance as described under section [Docker](#docker)

## Installation
```
$ npm install imicros-flow --save
```
## Dependencies
Requires a running [Kafka](https://kafka.apache.org/) broker.

# Usage
## Usage Publisher
```js
const { ServiceBroker } = require("moleculer");
const { Publisher } = require("imicros-flow");

let broker  = new ServiceBroker({ logger: console });

broker.createService(Publisher, Object.assign({ settings: { brokers: ['localhost:9092'] } }));

let run = async () => {
    await broker.start();
    await broker.call("flow.publisher.emit", {
        topic: "users",             // optional: default value from settings or 'events'
        event: "my.first.event",
        payload: { msg: "somthing useful" }
    })
    await broker.stop();
}
run();

```
## Usage Static Subscriber
```js
const { ServiceBroker } = require("moleculer");
const { Publisher, StaticSubscriber } = require("imicros-flow");

let broker  = new ServiceBroker({ logger: console, logLevel: "info" });

broker.createService(Publisher, Object.assign({ settings: { brokers: ['localhost:9092'] } }));

broker.createService(StaticSubscriber, Object.assign({ 
    settings: { 
        brokers: ["localhost:9092"], 
        subscriptions: [
            {
                event: "my.first.event",
                action: "action.any"
            }
        ]
    } 
}));

broker.createService({
    name: "action",
    actions: {
        any: {
            async handler(ctx) {
                let result = { service: this.name, meta: ctx.meta, params: ctx.params }
                await this.logger.info("Service called:", result)
                return;
            }
        }
    }
})    
    
let run = async () => {
    await broker.start();
    await broker.call("flow.publisher.emit", {
        event: "my.first.event",
        payload: { msg: "somthing useful" }
    })
    // wait some time for consuming...
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve()
      }, 500)
    })
    await broker.stop();
}
run();

```

### Usage Static Subscriber for Chaining
```js
broker.createService(StaticSubscriber, Object.assign({ 
    settings: { 
        brokers: ["localhost:9092"], 
        subscriptions: [
            {
                topic: "users",
                event: "user.created",
                params: { userId: "payload.user.id" },
                action: "registration.requestConfirmationMail",
                emit: {
                    topic: "mailer",
                    event: "request.sendMail",
                    payload: { template: "result.mailTemplate", mailTo: "meta.user.email" }
                }
            },
            {
                topic: "mailer",
                event: "request.sendMail",
                action: "mailer.sendmail"       // will be called with params = payload
            }
        ]
    } 
}));

```
## Options
### General Publisher/Subscriber Options
#### broker
- array of kafka broker
- refer to description of module [kafkajs](https://github.com/tulios/kafkajs)
#### ssl
- refer to description of module [kafkajs](https://github.com/tulios/kafkajs)
#### connectionTimeout
- refer to description of module [kafkajs](https://github.com/tulios/kafkajs)
#### retry
- refer to description of module [kafkajs](https://github.com/tulios/kafkajs)
#### topics.event
- name of the default topic to be used (default `events`)

### Subscription Options
#### topic
- subscribe messages for this topic
#### event
- listen for this event
- possible with wildcards e.g. 
  - `user.*` matches `user.created`, `user.confirmed` but not `user.changed.profile`
  - `user.**` matches all events starting with user. including `user.changed.profile`
  - `*.log` matches `user.log` but not `user.changed.log`
  - `**.log` matches all events ending with `.log`
  - `user.*.log` matches all events like `user.created.log`, `user.changed.log` 
#### params
- w/o this option the action is called with _params_ = _payload_ of the event
- otherwise it is called with the given value
Parameters can be mapped by a valid path for the _payload_ of the event or the _meta_ data of the event.
#### action
- a given action will be called after receipts an event which matched the pattern
#### emit
- a given event will be publish after successful call of the given action
##### emit.topic
- the topic to which the subscription emits must be different to the topic, which it subscribes 
##### emit.event
- the event which the subscription emits 
##### emit.payload
- w/o this option the termination event is called with _payload_ = _result_ of the action
- otherwise it is emitted with the given value
Payload can be mapped by a valid path for the _result_ of the called action or the _meta_ data of the event.

# Docker
You can use the files in folder docker as a basis for your own configuration.
Copy all files and the folder services to your docker folder.
The files have to be adopted to meet your environment as described below.
Then start the daemon with `docker-compose up -d`.
## docker-compose.yml
adopt the names of the externals_links (nats and kafka_kafka_1) and the names of the networks (redis_default, nats_default and kafka_default) to your docker settings. 
You can fetch the names via command `docker container ls` and `docker network ls`
```
version: '2'
services:

    publisher:
        build:
            context: .
        image: flow-publisher
        # env_file: docker-compose.env
        environment:
            SERVICES: publisher
        external_links:
        # depends on the names of your running docker services for nats and kafka
        - nats
        -  kafka_kafka_1
        # depends on the names of the networks of your running docker services
        networks:
        - default
        - redis_default
        - nats_default
        - kafka_default

    # for multible subscriber with different subscriptions add a sequence number per subscriber service
    subscriber-1:
        build:
            context: .
        image: flow-subscriber-1
        # env_file: docker-compose.env
        environment:
            SERVICES: subscriber-1
        external_links:
        # depends on the names of your running docker services for nats and kafka
        - nats
        -  kafka_kafka_1
        networks:
        - default
        # depends on the names of the networks of your running docker services
        - redis_default
        - nats_default
        - kafka_default

networks:
    redis_default:
        external: true
    nats_default:
        external: true
    kafka_default:
        external: true
    
```
## moleculer.config.js
adopt the hostname (nats) according to your containername:
```
    transporter: "nats://nats:4222",
```
if you want to use the cache also, the hostname must be adopted to:
```
    /*
    cacher: {
        type: "Redis",
        options: {
            redis: {
                host: "192.168.2.124",
                db: 1
            }
        }
    },
    */
```
## services/publisher.service.js
adopt the hostname (kafka) according to your containername.
```
    brokers: ["kafka_kafka_1:9092"]
```
## services/subscriber-1.service.js
adopt the hostname (kafka) according to your containername:
```
    brokers: ["kafka_kafka_1:9092"]
```
add your own subscriptions instead of the examples:
```
    subscriptions: [
        {
            id: "registration" ,                        // consumer group
            //fromBeginning: 'earliest',                // if already events exists and consumer group should handle
                                                        // them starting with the first existing
            event: "user.created",                      // event listening for
            action: "registration.requestConfirmation"  // action to be called
        }
    ]
```



