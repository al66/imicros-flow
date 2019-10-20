"use strict";

const { ServiceBroker } = require("moleculer");
const { StaticSubscriber } = require("../index");
const { Publisher } = require("../index");

let broker  = new ServiceBroker({ logger: console, logLevel: "info" });

broker.createService(Publisher, Object.assign({ settings: { brokers: ["192.168.2.124:9092"] } }));

let timestamp = Date.now();
broker.createService(StaticSubscriber, Object.assign({ 
    settings: { 
        brokers: ["192.168.2.124:9092"], 
        subscriptions: [
            {
                id: "step.one" + timestamp,
                topic: "events2",
                event: "user.created",
                params: { userId: "payload.user.id" },
                action: "registration.requestConfirmationMail",
                emit: {
                    topic: "mailer",
                    event: "request.sendMail",
                    payload: { template: "result.template", mailTo: "meta.user.email" }
                }
            },
            {
                id: "step.two" + timestamp ,
                topic: "events2",
                event: "request.sendMail",
                action: "mailer.sendmail"       // will be called with params = payload
            }
        ]
    } 
}));

broker.createService({
    name: "registration",
    actions: {
        requestConfirmationMail: {
            async handler(ctx) {
                let result = { template: "my-template", meta: ctx.meta, params: ctx.params };
                await this.logger.info("Service called:" + this.name, result);
                return result;
            }
        }
    }
});    

broker.createService({
    name: "mailer",
    actions: {
        sendmail: {
            async handler(ctx) {
                let result = { meta: ctx.meta, params: ctx.params };
                await this.logger.info("Service called:" + this.name, result);
                return result;
            }
        }
    }
});    
    
let run = async () => {
    await broker.start();
    await broker.call("flow.publisher.emit", {
        topic: "events2",
        event: "user.created",
        payload: { user: { id: "123456789" } }
    }, {
        meta: {
            user: {
                email: "test@test.com"
            }
        }
    })
    .then(res => console.log(res))
    .catch(err => console.error(err));
    // wait some time for consuming...
    await new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, 2000);
    });
    await broker.stop();
};
run();
