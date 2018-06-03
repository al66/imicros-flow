"use strict";

const mapper = require("../lib/util/mapper");

describe("Test Mapper", () => {

    it("it should be a function", () => {
        expect(typeof mapper === "function").toBe(true);
    });
    
    it("it should map json input", () => {
        let result = mapper({ account: { id: "meta.user.id" } },{ meta: { user: { id: "123456" } } });
        expect(result).toBeDefined();
        expect(result).toEqual({ account: { id: "123456" } });
    });
    
    it("it should also work without any input", () => {
        let result = mapper({ account: { id: "meta.user.id" }, test: "Hallo" }  );
        expect(result).toBeDefined();
        expect(result).toEqual({ account: { id: "meta.user.id" }, test: "Hallo" });
    });
    
    it("it should also work without any output", () => {
        let result = mapper(null, { test: "Hallo" }  );
        expect(result).toEqual(null);
    });
    
    it("it shouldn't replace other texts or numbers", () => {
        let result = mapper({ account: { id: "meta.user.id" }, test: "Hallo", age: 55 },{ meta: { user: { id: "123456" } } });
        expect(result).toBeDefined();
        expect(result).toEqual({ account: { id: "123456" }, test: "Hallo", age: 55 });
    });
    
});