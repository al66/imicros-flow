
const { ServiceBroker } = require("moleculer");
const { Parser } = require("../lib/parser/basic");
const fs = require("fs");
const util = require("util");
const { v4: uuid } = require("uuid");

// const objectName = "assets/Process Example.bpmn";
// const objectName = "assets/Gateway.bpmn";
// const objectName = "assets/All Elements.bpmn";
const objectName = "assets/Process E.bpmn";
const xmlData = fs.readFileSync(objectName);

async function run () {

    broker = new ServiceBroker({
        logger: console,
        logLevel: "info" //"debug"
    });
    await broker.start();
    
    const parser = new Parser({broker});

    let id = uuid();
    let ownerId = uuid();
    const rawParsedData = parser.toJson({xmlData});
    console.log(util.inspect(rawParsedData, { showHidden: false, depth: null, colors: true }));

    const parsedData = parser.parse({id, xmlData, objectName, ownerId});
    console.log(util.inspect(parsedData, { showHidden: false, depth: null, colors: true }));

}

run();