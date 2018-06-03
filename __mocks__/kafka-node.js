"use strict";
const EventEmitter = require("events");

class KafkaClient extends EventEmitter {

    constructor () {
        super();    
    }
    
    close () {}
		
}

class HighLevelProducer extends EventEmitter {

    constructor (client) {
        super();
        if (!(client instanceof KafkaClient)) throw new Error("kafka-node mock: HighLevelProducer - invalid client parameter");
    }

    send (payload, callback) {
        callback(null,payload);        
    }
		
    on (event, callback) {
        super.on(event, callback);	
		// simulate established connection
        if (event === "ready") callback();
    }	
		
}

module.exports = {
    KafkaClient: KafkaClient,
    HighLevelProducer: HighLevelProducer,
};