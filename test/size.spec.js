"use strict";

const size = require("../lib/util/size");

describe("Test obejct size function", () => {

    it("it should be a function", () => {
        expect(typeof size === "function").toBe(true);
    });
    
    it("it should return size", () => {
        let result = size({ account: { id: "meta.user.id" }, meta: { user: { id: "123456" } } });
        let len = ( "account".length + "id".length + "meta.user.id".length + "meta".length + "user".length + "id".length + "123456".length ) * 2;
        expect(result).toBeDefined();
        expect(result).toEqual(expect.objectContaining({ bytes: len, value: len, unit: "Bytes" }));
    });
    
});