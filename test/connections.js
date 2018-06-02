const { Kafka, logLevel } = require('kafkajs')

const PERFORMANCE_TEST = true

const serviceLogger = kafkalogLevel => ({ namespace, level, label, log }) => {
    if (!PERFORMANCE_TEST) console.log(label + " namespace:" + log.message, log)
}

// Create the client with the broker list
const kafka = new Kafka({
  clientId: "test",
  brokers: ['192.168.2.124:9092'],
  logLevel: 5,
  logCreator: serviceLogger
})


const consumers = [
  kafka.consumer({ groupId: 'g1' + Date.now() }),
  kafka.consumer({ groupId: 'g2' + Date.now() }),
  kafka.consumer({ groupId: 'g3' + Date.now() })
]
const producer = kafka.producer()

var receipts = 0;
const eachEvent = () => {
    return async ({ topic, partition, message }) => {
        let event, offset;
        try {
            offset = message.offset.toString();
            let content = JSON.parse(message.value.toString());
            receipts++;
            if (!PERFORMANCE_TEST) {
                console.log(`Event topic ${topic} offset ${offset} received`, {
                        value: content
                    })
            }
        } catch(e) {
            console.log(e)
        }
    }
}

let n = PERFORMANCE_TEST ? 1000 : 1;
let emit = async () => {
    for (let i=0; i<n; i++) {
        await producer.send({
            topic: "events",
            messages: [
                { value: JSON.stringify({ number: i }) }
            ],
        })
    }
}

const run = async () => {
    await Promise.all(consumers.map( async(c) => {
        await c.connect();
        await c.subscribe({ topic: "events", fromBeginning: false })
        //await c.subscribe({ topic: "events" })
        await c.run({
                    eachMessage: eachEvent(),
                })
    }))
    await producer.connect()

    let ts = Date.now();
    await emit();
    let te = Date.now();
    if (PERFORMANCE_TEST) {
        console.log({
            "receipts": receipts,
            "time (ms)": te-ts
        })
    }
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve()
      }, 1000)
    })

    await Promise.all(consumers.map(c => c.disconnect()))
    await producer.disconnect();
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve()
      }, 1000)
    })
    if (!PERFORMANCE_TEST) {
        // check for open handles
        console.log(process._getActiveRequests());
        console.log(process._getActiveHandles());
    }
} 
run()

