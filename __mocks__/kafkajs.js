"use strict";
const { logLevel } = require("kafkajs");

let consumers = [];

class Consumer {
    
    constructor () {
        this.topics = [];
        consumers.push(this);
    }
    
    connect () {
        
    }
    
    subscribe (options) {
        this.topics.push(options.topic);
    }
    
    run (options) {
        this.eachMessage = options.eachMessage;        
    }
    
    disconnect () {
        
    }
    
 }

class mockKafka {
	
    static async __emit (topic, offset, payload) {
        let args = { 
            topic: topic, 
            partition: 0, 
            message: { 
                offset: offset,
                value: JSON.stringify(payload)
            }
        };
        await Promise.all(consumers.map(async (consumer) => {
            if (consumer.topics.indexOf(topic) < 0) return;
            await consumer.eachMessage(args);
        }));
    }
    
    consumer (options) {
        return new Consumer(options);
    }
}


module.exports = {
    Kafka: mockKafka,
    logLevel: logLevel
};