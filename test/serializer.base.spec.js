"use strict";

const { Serializer } = require("../lib/serializer/base");
const fs = require("fs");

//const timestamp = Date.now();
const serializer = new Serializer();

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

describe("Test serializer", () => {
        
    it("it should serialize an object", async () => {
        let obj = { any: "object",
            with: {
                deep: "structure"
            }
        };
        let encoded = await serializer.serialize(obj) + "";
        let decoded = await serializer.deserialize(encoded);
        expect(decoded).toEqual(obj);
    });

    it("it should serialize a string", async () => {
        let str = "<html><body></body></html>";
        let encoded = await serializer.serialize(str) + "";
        let decoded = await serializer.deserialize(encoded);
        expect(decoded).toEqual(str);
    });

    it("it should serialize a buffer", async () => {
        let buf = Buffer.from("String");
        let encoded = await serializer.serialize(buf) + "";
        let decoded = await serializer.deserialize(encoded);
        expect(decoded).toEqual(buf);
    });

    it("it should serialize a boolean", async () => {
        let bool = true;
        let encoded = await serializer.serialize(bool) + "";
        let decoded = await serializer.deserialize(encoded);
        expect(decoded).toEqual(bool);
    });

    it("it should serialize a number", async () => {
        let number = 123456789;
        let encoded = await serializer.serialize(number) + "";
        let decoded = await serializer.deserialize(encoded);
        expect(decoded).toEqual(number);
    });

    it("it should serialize a timestamp", async () => {
        let timestamp = Date.now();
        let encoded = await serializer.serialize(timestamp) + "";
        let decoded = await serializer.deserialize(encoded);
        expect(decoded).toEqual(timestamp);
    });

    it("it should serialize a function", async () => {
        function testFunction(param1, param2) {
            return param1 + param2;
        }
        let encoded = await serializer.serialize(testFunction) + "";
        let decoded = await serializer.deserialize(encoded);
        expect(decoded("Hallo,", "Echo")).toEqual("Hallo,Echo");
    });

    it("it should serialize an embedded function", async () => {
        function testFunction(param1, param2) {
            return param1 + param2;
        }
        let test = {
            func: testFunction
        };
        let encoded = await serializer.serialize(test) + "";
        let decoded = await serializer.deserialize(encoded);
        expect(decoded.func("Hallo,", "Echo")).toEqual("Hallo,Echo");
    });

    it("it should serialize a stream", async () => {
        let filename = "./test/serializer.test.file.json";
        let stream = fs.createReadStream(filename);
        let file = fs.readFileSync(filename, "utf8");
        
        let encoded = await serializer.serialize(stream) + "";
        let decoded = await serializer.deserialize(encoded);
        let result = await getStream(decoded);
        expect(result).toEqual(file);
        
    });

});
    