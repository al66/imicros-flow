"use strict";
const { Kafka, logLevel } = require("kafkajs");

const serviceLogger = () => ({ label, log }) => {
    console.log(label + " namespace:" + log.message, log);
};

// Create the client with the broker list
const kafka = new Kafka({
    clientId: "test",
    brokers: ["192.168.2.124:9092"],
    logLevel: logLevel.INFO,
    logCreator: serviceLogger
});


const consumers = [
    //kafka.consumer({ groupId: "g1" + Date.now() }),
    //kafka.consumer({ groupId: "g2" + Date.now() }),
    kafka.consumer({ groupId: "g3" + Date.now() })
];

let receipts = 0;
const eachEvent = () => {
    return async ({ topic, message }) => {
        console.log(`Event topic ${topic} received`);
        let offset;
        try {
            offset = message.offset.toString();
            let content = JSON.parse(message.value.toString());
            receipts++;
            console.log(`Event topic ${topic} offset ${offset} received`, {
                value: content
            });
        } catch(e) {
            console.log(e);
        }
    };
};

const run = async () => {
    await Promise.all(consumers.map( async(c) => {
        await c.connect();
        await c.subscribe({ topic: "dummy.tasks", fromBeginning: true });
        await c.run({
            eachMessage: eachEvent(),
        });
    }));
    
    await new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, 5000);
    });
    console.log(receipts);
    await Promise.all(consumers.map(c => c.disconnect()));
    await new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, 1000);
    });
}; 
run();
