# imicros-flow
[![Build Status](https://travis-ci.org/al66/imicros-flow.svg?branch=master)](https://travis-ci.org/al66/imicros-flow)
[![Coverage Status](https://coveralls.io/repos/github/al66/imicros-flow/badge.svg?branch=master)](https://coveralls.io/github/al66/imicros-flow?branch=master)

[Moleculer](https://github.com/moleculerjs/moleculer) service for loose coupled event handling

# Installation
```
$ npm install imicros-flow --save
```
# Dependencies
Requires a running [Kafka](https://kafka.apache.org/) broker.

# Usage Publisher
```js
const { ServiceBroker } = require("moleculer");
const { Publisher } = require("imicros-flow");

let broker  = new ServiceBroker({ logger: console });

broker.createService(Publisher, Object.assign({ settings: { brokers: ['localhost:9092'] } }));

let run = async () => {
    await broker.start();
    await broker.call("flow.publisher.emit", {
        event: "my.first.event",
        payload: { msg: "somthing useful" }
    })
    await broker.stop();
}
run();

```
# Usage Static Subscriber
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

## Usage Static Subscriber for Chaining
```js
broker.createService(StaticSubscriber, Object.assign({ 
    settings: { 
        brokers: ["localhost:9092"], 
        subscriptions: [
            {
                event: "my.first.event",
                params: { text: "payload.msg" },
                action: "action.any",
                emit: "action.terminated",
                payload: { origin: "my.first.event" }
            },
            {
                event: "action.terminated",
                params: { comesFrom: "payload.msg" },
                action: "action.another",                   // returns user.email
                emit: "another.action.terminated",
                payload: { goesTo: "result.user.email"}
            }
            // ...and so on
        ]
    } 
}));

```
## Options
### params
- w/o this option the action is called with _params_ = _payload_ of the event
- otherwise it is called with the given value
Parameters can be mapped by a valid path for the _payload_ of the event or the _meta_ data of the event.
### payload
- w/o this option the termination event is called with _payload_ = _result_ of the action
- otherwise it is emitted with the given value
Payload can be mapped by a valid path for the _result_ of the called action or the _meta_ data of the event.


