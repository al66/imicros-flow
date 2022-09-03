/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

/* istanbul ignore file */

class Constants {

    static get STATIC_GROUP() { return "flow"; }
    // Task types
    static get SEND_TASK() { return "Send Task"; }
    static get RECEIVE_TASK() { return "Receive Task"; }
    static get USER_TASK() { return "User Task"; }
    static get MANUAL_TASK() { return "Manual Task"; }
    static get BUSINESS_RULE_TASK() { return "Business Rule Task"; }
    static get SERVICE_TASK() { return "Service Task"; }
    static get SCRIPT_TASK() { return "Script Task"; }
    static get CALL_ACTIVITY() { return "Call Activity"; }
    // Gateway types
    static get EXCLUSIVE_GATEWAY() { return "Exclusive Gateway"; }
    static get EVENT_BASED_GATEWAY() { return "Event-based Gateway"; }
    static get PARALLEL_GATEWAY() { return "Parallel Gateway"; }
    static get INCLUSIVE_GATEWAY() { return "Inclusive Gateway"; }
    static get COMPLEX_GATEWAY() { return "Complex Gateway"; }
    static get EXCLUSIVE_EVENT_BASED_GATEWAY() { return "Exclusive Event-based Gateway"; }
    static get PARALLEL_EVENT_BASED_GATEWAY() { return "Parallel Event-based Gateway"; }
    // Event positions
    static get START_EVENT() { return "Start Event"; }
    static get INTERMEDIATE_EVENT() { return "Intermediate Event"; }
    static get END_EVENT() { return "End Event"; }
    // Event types
    static get DEFAULT_EVENT() { return "Default Event"; }
    static get MESSAGE_EVENT() { return "Message Event"; }
    static get TIMER_EVENT() { return "Timer Event"; }
    static get ESCALATION_EVENT() { return "Escalation Event"; }
    static get CONDITIONAL_EVENT() { return "Conditional Event"; }
    static get ERROR_EVENT() { return "Error Event"; }
    static get CANCEL_EVENT() { return "Cancel Event"; }
    static get COMPENSATION_EVENT() { return "Compensation Event"; }
    static get SIGNAL_EVENT() { return "Signal Event"; }
    static get MULTIPLE_EVENT() { return "Multiple Event"; }
    static get PARALLEL_MULTIPLE_EVENT() { return "Parallel Multiple Event"; }
    static get TERMINATE_EVENT() { return "Terminate Event"; }
    // Event directions
    static get CATCHING_EVENT() { return "Catching Event"; }
    static get THROWING_EVENT() { return "Throwing Event"; }
    // Event interactions
    static get SUB_PROCESS_INTERRUPTING_EVENT() { return "Sub-Process Interrupting Event"; }
    static get SUB_PROCESS_NON_INTERRUPTING_EVENT() { return "Sub-Process Non-Interrupting Event"; }
    static get BOUNDARY_INTERRUPTING_EVENT() { return "Boundary Interrupting Event"; }
    static get BOUNDARY_NON_INTERRUPTING_EVENT() { return "Boundary Non-Interrupting Event"; }
    // Sequence flow types
    static get SEQUENCE_STANDARD() { return "DIRECT"; }
    static get SEQUENCE_CONDITIONAL() { return "CONDITIONAL"; }
    // Token status
    static get SEQUENCE_ACTIVATED() { return "SEQUENCE.ACTIVATED"; }
    static get SEQUENCE_REJECTED() { return "SEQUENCE.REJECTED"; }
    static get SEQUENCE_ERROR() { return "SEQUENCE.ERROR"; }
    static get SEQUENCE_COMPLETED() { return "SEQUENCE.COMPLETED"; }
    static get SEQUENCE_ERROR() { return "SEQUENCE.ERROR"; }
    static get EVENT_ACTIVATED() { return "EVENT.ACTIVATED"; }
    static get EVENT_READY() { return "EVENT.READY"; }
    static get EVENT_WAITING() { return "EVENT.WAITING"; }
    static get EVENT_ERROR() { return "EVENT.ERROR"; }
    static get EVENT_OCCURED() { return "EVENT.OCCURED"; }
    static get PROCESS_ACTIVATED() { return "PROCESS.ACTIVATED"; }
    static get ACTIVITY_ACTIVATED() { return "ACTIVITY.ACTIVATED"; }
    static get ACTIVITY_READY() { return "ACTIVITY.READY"; }
    static get ACTIVITY_COMPLETED() { return "ACTIVITY.COMPLETED"; }
    static get ACTIVITY_ERROR() { return "ACTIVITY.ERROR"; }
    static get GATEWAY_ACTIVATED() { return "GATEWAY.ACTIVATED"; }
    static get GATEWAY_COMPLETED() { return "GATEWAY.COMPLETED"; }
    static get GATEWAY_RED_BUTTON() { return "GATEWAY.RED_BUTTON"; }
    static get PROCESS_ERROR() { return "PROCESS.ERROR"; }
    // Instance status
    static get INSTANCE_RUNNING() { return "INSTANCE.RUNNING"; }
    static get INSTANCE_FAILED() { return "INSTANCE.FAILED"; }
    static get INSTANCE_COMPLETED() { return "INSTANCE.COMPLETED"; }
    
    // Context
    static get CONTEXT_ERROR() { return "_ERROR"; } 
}

module.exports = Constants;