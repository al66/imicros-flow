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
	
    constructor (options) {
        // Test log
        if (options.logCreator) {
            this.logger = options.logCreator();
            this.logger({ namespace: "KAFKA:", level: 0, log: { message: "log Level 0" }});
            this.logger({ namespace: "KAFKA:", level: 1, log: { message: "log Level 1" }});
            this.logger({ namespace: "KAFKA:", level: 2, log: { message: "log Level 2" }});
            this.logger({ namespace: "KAFKA:", level: 3, log: { message: "log Level 3" }});
            this.logger({ namespace: "KAFKA:", level: 4, log: { message: "log Level 4" }});
            this.logger({ namespace: "KAFKA:", level: 5, log: { message: "log Level 5" }});
        }
    }
    
    static async __emit (topic, offset, payload) {
        let args = { 
            topic: topic, 
            partition: 0, 
            message: { 
                offset: offset,
                value: JSON.stringify(payload)
            }
        };
        let result = {
            success: 0,
            failed: 0
        };
        await Promise.all(consumers.map(async (consumer) => {
            if (consumer.topics.indexOf(topic) < 0) return;
            try {
                await consumer.eachMessage(args);
                result.success++;
            } catch (err) {
                result.failed++;
            }
        }));
        return result;
    }
    
    consumer (options) {
        return new Consumer(options);
    }
}


module.exports = {
    Kafka: mockKafka,
    logLevel: logLevel
};