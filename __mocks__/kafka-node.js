"use strict";
const EventEmitter = require("events");

let producers = [];
let clients = [];

class KafkaClient extends EventEmitter {

    constructor () {
        super();    
        clients.push(this);
    }
    
    close () {}
		
}

class HighLevelProducer extends EventEmitter {
    
    constructor (client) {
        super();
        producers.push(this);
        this.fail = false;
        if (!(client instanceof KafkaClient)) throw new Error("kafka-node mock: HighLevelProducer - invalid client parameter");
    }

    send (payload, callback) {
        if (this.fail) return callback(new Error("send failed"));
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
    producers: producers,
    clients: clients
};