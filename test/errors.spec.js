"use strict";

const {     FlowError,
            FlowPublishFailedAuthorization,
            FlowSubscriptionFailedAuthorization,
            FlowSubscriptionRuleNoMatch } = require("../lib/util/errors");

describe("Test Mapper", () => {
   
    it("it should create error without parameters", () => {
        expect(new FlowError("message") instanceof FlowError).toBe(true);
    });
    
    it("it should create error without parameters", () => {
        expect(new FlowPublishFailedAuthorization("message") instanceof FlowPublishFailedAuthorization).toBe(true);
    });
    
    it("it should create error without parameters", () => {
        expect(new FlowSubscriptionFailedAuthorization("message") instanceof FlowSubscriptionFailedAuthorization).toBe(true);
    });
    
    it("it should create error without parameters", () => {
        expect(new FlowSubscriptionRuleNoMatch("message") instanceof FlowSubscriptionRuleNoMatch).toBe(true);
    });
    
    
});