/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const stream = require("stream");
//const { Transform } = require("stream");

function encode(name, value) {
    if (typeof value === "function" ) {
        return value.toString();
    } else {
        return value;
    }
}

function decode(name, value) {
    if (typeof value === "string" && value.indexOf("function ") === 0)  {
        return new Function("return " + value)();
    } else {
        return value;
    }
}

async function getStream(stream) {
    let result = new Promise(function(resolve, reject) {
        let content = "";
        stream.on("data",(chunk) => {
            content += chunk.toString();
        });
        stream.on("end",function(){
            resolve(content);
        });
        stream.on("error", reject);
    });
    return await result;
}

class Serializer {
    async serialize(obj) {
        let val = {};
        if (obj instanceof stream.Readable) {
            val.type = "stream.Readable";
            val.value = await getStream(obj);
        } else if (Buffer.isBuffer(obj)) {
            val.type = "buffer";
            val.value = obj.toString("base64");
        } else if (typeof obj == "object") {
            return JSON.stringify(obj, encode);
        } else {
            switch (typeof obj) {
                case "number":
                    val.type = "number";
                    val.value = obj.toString();
                    break;
                case "string":
                    val.type = "string";
                    val.value = obj.toString();
                    break;
                case "function":
                    val.type = "function";
                    val.value = obj.toString();
                    break;
                case "boolean":
                    val.type = "boolean";
                    val.value = obj.toString();
                    break;
            }
        } 
        return JSON.stringify(val, encode);
    }
    
    async deserialize(buf) {
        let decoded = JSON.parse(buf,decode);
        
        switch (decoded.type) {
            case "stream.Readable": 
                {
                    let s = new stream.Readable;
                    s.push(decoded.value);
                    s.push(null);
                    decoded = s;
                }
                break;
            case "buffer":
                decoded = Buffer.from(decoded.value, "base64");
                break;
            case "number":
                decoded = parseFloat(decoded.value);
                break;
            case "string":
                decoded = decoded.value;
                break;
            case "function":
                decoded = new Function("return " + decoded.value)();
                break;
            case "boolean":
                decoded = (decoded.value === "true");
                break;
        }
        return decoded;  
    }
}

module.exports = Serializer;