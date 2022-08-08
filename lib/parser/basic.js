/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { XMLParser } = require("fast-xml-parser");
const { v4: uuid } = require("uuid");

const Constants = require("../util/constants");
const { Serializer } = require("../serializer/base");

class Parser {
  
    constructor ({ broker, options = {}}) {
         
        // Moleculer service broker & logger
        this.broker = broker;
        this.logger = this.broker.logger;
 
        // serializer
        this.serializer = new Serializer();
 
        // xml parser setup
        const parserOptions = {
           attributeNamePrefix : "_",
           removeNSPrefix: true,
           ignoreAttributes : false,
           ignoreNameSpace : false,
           allowBooleanAttributes : true,
           parseNodeValue : true,
           parseAttributeValue : true,
           trimValues: true,
           cdataTagName: "__cdata", //default is 'false'
           cdataPropName: "__cdata", //default is 'false'
           cdataPositionChar: "\\c",
           parseTrueNumberOnly: false
           //    attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}),//default is a=>a
           //    tagValueProcessor : (val, tagName) => he.decode(val), //default is a=>a
           // stopNodes: ["definitions.BPMNDiagram"]
        };
        this.parser = new XMLParser(parserOptions);
 
        // id map
        this.idMap = {};

    }

    toArray( value ) {
        return Array.isArray(value) ? value : ( value ? [value] : [] );
    }

    toJson({ xmlData }) {
        let json = this.parser.parse(xmlData); 
        if (json.definitions.BPMNDiagram) delete json.definitions.BPMNDiagram;
        return json;
    }

    mapId(extern) {
        if (!extern) return null;
        if (!this.idMap[extern]) this.idMap[extern] = uuid();
        return this.idMap[extern];
    }

    parsePreparation({ from, to }) {
        if (from) {
            to.preparation = {
                input: [],
                template: {
                    language: 'JSONata',
                    body: from['#text']
                }
            };
            this.toArray(from.context).forEach((io) => {
                to.preparation.input.push(io._key);
            });
        }
    }

    parseExpression({ from, to }) {
        if (from) {
            to.expression = {
                language: from._language,
                body: from['#text']
            }
        }
    }

    parseTimer({ from, to }) {
        if (from) {
            to.timer = {
                duration: from._duration,
                cycle: from._cycle
            }
        }
    }

    parseDefault({ from, to }) {
        if (from) {
            to.default = this.mapId(from)
        }
    }

    parseSignalType({ from, to }) {
        if (from?.signalEventDefinition) {
            to.type = Constants.SIGNAL_EVENT
        }
        if (from?.timerEventDefinition) {
            to.type = Constants.TIMER_EVENT
        }
        if (from?.messageEventDefinition) {
            to.type = Constants.MESSAGE_EVENT
        }
        if (from?.errorEventDefinition) {
            to.type = Constants.ERROR_EVENT
        }
        if (from?.escalationEventDefinition) {
            to.type = Constants.ESCALATION_EVENT
        }
    }

    parseSequences({ from, to, subprocess }) {
        if (from) {
            to.sequence = [];
            this.toArray(from.sequenceFlow).forEach((e) => {
                let sequence = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    fromId: this.mapId(e._sourceRef),
                    toId: this.mapId(e._targetRef),
                    type: Constants.SEQUENCE_STANDARD,
                    attributes: {}
                };
                if (e.extensionElements?.sequenceFlow?.expression) {
                    sequence.type = Constants.SEQUENCE_CONDITIONAL;
                    sequence.attributes.input = [];
                    this.toArray(e.extensionElements?.sequenceFlow?.context).forEach((io) => {
                        sequence.attributes.input.push(io._key);
                    });
                    this.parseExpression({ from: e.extensionElements?.sequenceFlow?.expression, to: sequence.attributes });
                }
                to.sequence.push(sequence);
            });
        }
    }

    parseGateways({ from, to, subprocess}) {
        to.gateway = [];
        if (from) {
            // Parse parallel gateways
            this.toArray(from.parallelGateway).forEach((e) => {
                let gateway = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    type: Constants.PARALLEL_GATEWAY,
                    incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                    outgoing: this.toArray(e.outgoing).map(id => this.mapId(id))
                }
                this.parseDefault({ from: e._default, to: gateway });
                to.gateway.push(gateway);
            });

            // Parse inclusive gateways
            this.toArray(from.inclusiveGateway).forEach((e) => {
                let gateway = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    type: Constants.INCLUSIVE_GATEWAY,
                    incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                    outgoing: this.toArray(e.outgoing).map(id => this.mapId(id))
                }
                this.parseDefault({ from: e._default, to: gateway });
                to.gateway.push(gateway);
            });

            // Parse exclusive gateways
            this.toArray(from.exclusiveGateway).forEach((e) => {
                let gateway = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    type: Constants.EXCLUSIVE_GATEWAY,
                    incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                    outgoing: this.toArray(e.outgoing).map(id => this.mapId(id))
                }
                this.parseDefault({ from: e._default, to: gateway });
                to.gateway.push(gateway);
            });

            // Parse event based gateways
            this.toArray(from.eventBasedGateway).forEach((e) => {
                let gateway = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    type: Constants.EVENT_BASED_GATEWAY,
                    incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                    outgoing: this.toArray(e.outgoing).map(id => this.mapId(id))
                }
                this.parseDefault({ from: e._default, to: gateway });
                to.gateway.push(gateway);
            });
            
            // Parse complex gateways
            this.toArray(from.complexGateway).forEach((e) => {
                let gateway = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    type: Constants.COMPLEX_GATEWAY,
                    incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                    outgoing: this.toArray(e.outgoing).map(id => this.mapId(id))
                }
                this.parseDefault({ from: e._default, to: gateway });
                to.gateway.push(gateway);
            });
        }
    }

    parseTasks({ from, to, subprocess }) {
        to.task = [];
        // Parse business rule tasks
        this.toArray(from.businessRuleTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.BUSINESS_RULE_TASK,
                attributes: {
                    input: [],
                    output: ''
                }
            };
            this.parseDefault({ from: e._default, to: task });
            if(e.extensionElements?.businessRuleTask?.object) {
                task.attributes.object = {
                    objectName: e.extensionElements.businessRuleTask.object._objectName,
                    embedded: e.extensionElements.businessRuleTask.object._embedded || false   
                }
            }
            this.toArray(e.extensionElements?.businessRuleTask?.context).forEach((io) => {
                if (io._io === 'in') task.attributes.input.push(io._key);
                if (io._io === 'out') task.attributes.output = io._key;
            });
            to.task.push(task);
        });

        // Parse service tasks
        this.toArray(from.serviceTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.SERVICE_TASK,
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            this.parsePreparation({ from: e.extensionElements?.serviceTask?.preparation, to: task.attributes });
            this.toArray(e.extensionElements?.serviceTask?.context).forEach((io) => {
                if (io._io === 'in') task.attributes.input = io._key;
                if (io._io === 'out') task.attributes.output = io._key;
            });
            if (e.extensionElements?.serviceTask?._action) {
                task.attributes.action = e.extensionElements?.serviceTask?._action
            }
            if (e.extensionElements?.serviceTask?._serviceId) {
                task.attributes.serviceId = e.extensionElements?.serviceTask?._serviceId
            }
            to.task.push(task);
        });

        // Parse send task
        this.toArray(from.sendTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.SEND_TASK,
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            this.parsePreparation({ from: e.extensionElements?.sendTask?.preparation, to: task.attributes });
            this.toArray(e.extensionElements?.serviceTask?.context).forEach((io) => {
                if (io._io === 'in') task.attributes.input = io._key;
                if (io._io === 'out') task.attributes.output = io._key;
            });
            if (e.extensionElements?.serviceTask?._action) {
                task.attributes.action = e.extensionElements?.serviceTask?._action
            }
            if (e.extensionElements?.serviceTask?._messageName) {
                task.attributes.messageName = e.extensionElements?.serviceTask?._messageName
            }
            to.task.push(task);
        });

        // Parse receive task
        this.toArray(from.receiveTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.RECEIVE_TASK,
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            to.task.push(task);
        });

        // Parse script task
        this.toArray(from.scriptTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.SCRIPT_TASK,
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            to.task.push(task);
        });

        // Parse call activity
        this.toArray(from.callActivity).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.CALL_ACTIVITY,
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            to.task.push(task);
        });

        // Parse user tasks
        this.toArray(from.userTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.USER_TASK,
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            to.task.push(task);
        });

        // Parse manual tasks
        this.toArray(from.manualTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.MANUAL_TASK,
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            to.task.push(task);
        });
    }

    parseEvents({ from, to, subprocess }) {
        // Parse start events
        this.toArray(from.startEvent).forEach((e) => {
            let event = {
                id: this.mapId(e._id),
                name: e._name || "",
                subprocess,
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                position: Constants.START_EVENT,
                type: Constants.DEFAULT_EVENT,
                direction: Constants.CATCHING_EVENT,
                interaction: null,
                attributes: {
                    name: e.extensionElements?.startEvent?._eventName || null
                }
            };
            this.parseSignalType({ from: e, to: event });
            this.parseExpression({ from: e.extensionElements?.startEvent?.expression, to: event.attributes });
            this.parseTimer({ from: e.extensionElements?.startEvent?.timer, to: event.attributes });
            this.toArray(e.extensionElements?.startEvent?.context).forEach((io) => {
                if (io._io === 'out') event.attributes.output = io._key;
            });
            to.event.push(event);
        });

        // Parse intermediate throwing events
        this.toArray(from.intermediateThrowEvent).forEach((e) => {
            let event = {
                id: this.mapId(e._id),
                name: e._name || "",
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                position: Constants.INTERMEDIATE_EVENT,
                type: Constants.DEFAULT_EVENT,
                direction: Constants.THROWING_EVENT,
                interaction: null,
                attributes: {
                    name: e.extensionElements?.intermediateEvent?._eventName || null
                }
            };
            this.parseSignalType({ from: e, to: event });
            this.parsePreparation({ from: e.extensionElements?.intermediateEvent?.preparation, to: event.attributes });
            this.toArray(e.extensionElements?.intermediateEvent?.context).forEach((io) => {
                if (io._io === 'out') event.attributes.output = io._key;
            });
            to.event.push(event);
        });

        // Parse intermediate catching events
        this.toArray(from.intermediateCatchEvent).forEach((e) => {
            let event = {
                id: this.mapId(e._id),
                name: e._name || "",
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                position: Constants.INTERMEDIATE_EVENT,
                type: Constants.DEFAULT_EVENT,
                direction: Constants.CATCHING_EVENT,
                interaction: null,
                attributes: {
                    name: e.extensionElements?.intermediateEvent?._eventName || null
                }
            };
            this.parseSignalType({ from: e, to: event });
            this.parseTimer({ from: e.extensionElements?.intermediateEvent?.timer, to: event.attributes });
            to.event.push(event);
        });

        // Parse end events
        this.toArray(from.endEvent).forEach((e) => {
            let event = {
                id: this.mapId(e._id),
                name: e._name || "",
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                position: Constants.END_EVENT,
                type: Constants.DEFAULT_EVENT,
                direction: Constants.THROWING_EVENT,
                interaction: null,
                attributes: {
                    name: e.extensionElements?.endEvent?._eventName || null
                }
            };
            this.parseSignalType({ from: e, to: event });
            this.parsePreparation({ from: e.extensionElements?.endEvent?.preparation, to: event.attributes });
            this.toArray(e.extensionElements?.endEvent?.context).forEach((io) => {
                if (io._io === 'out') event.attributes.output = io._key;
            });
            to.event.push(event);
        });
    }

    parse({ id, xmlData, objectName, ownerId, core }) {
        let jsonObj = this.toJson({ xmlData });
        
        if (!jsonObj.definitions) return { failed: true, err: "unvalid definition - missing element bpmn:definitions"};
      
        let parsedProcess = {
            event: []
        };

        let bpmnProcess = jsonObj.definitions?.process ??  null;
        if (bpmnProcess) {

            // Parse process attributes
            parsedProcess.process = {
                id: id || this.mapId(bpmnProcess._id ?? null),
                name: objectName,
                ownerId: ownerId,
                core                              // core group may listen to all events
            };
            parsedProcess.version = {
                id: uuid(),
                created: Date.now()
            };

            // Parse sequences
            this.parseSequences({ from: bpmnProcess, to: parsedProcess });

            // Parse tasks
            this.parseTasks({ from: bpmnProcess, to: parsedProcess });

            // Parse events
            this.parseEvents({ from: bpmnProcess, to: parsedProcess });

            // parse gateways
            this.parseGateways({ from: bpmnProcess, to: parsedProcess });

            parsedProcess.idMap = this.idMap;
        }
        
        this.logger.debug("parsed process", parsedProcess);
        
        return parsedProcess;
    }
};
 
 module.exports = {
     Parser
 };
 