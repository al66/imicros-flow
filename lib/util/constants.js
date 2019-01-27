/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

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
    // Gateway types
    static get EXCLUSIVE_GATEWAY() { return "Exclusive Gateway"; }
    static get EVENT_BASED_GATEWAY() { return "Event-based Gateway"; }
    static get PARALLEL_GATEWAY() { return "Parallel Gateway"; }
    static get INCLUSIVE_GATEWAY() { return "Inclusive Gateway"; }
    static get EXCLUSIVE_EVENT_BASED_GATEWAY() { return "Exclusive Event-based Gateway"; }
    static get PARALLEL_EVENT_BASED_GATEWAY() { return "Parallel Event-based Gateway"; }
    // Event positions
    static get START_EVENT() { return "Start Event"; }
    static get INTERMEDIATE_EVENT() { return "Intermediate Event"; }
    static get END_EVENT() { return "End Event"; }
    // Event types
    static get DEFAULT_EVENT() { return "None"; }
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
    static get SEQUENCE_STANDARD() { return "NEXT"; }
    static get SEQUENCE_CONDITIONAL() { return "NEXT"; }
    static get SEQUENCE_TASK_DONE() { return "DONE"; }
    static get SEQUENCE_TASK_ERROR() { return "ERROR"; }
    static get SEQUENCE_TASK_TIMER() { return "TIMER"; }
    
}

module.exports = Constants;