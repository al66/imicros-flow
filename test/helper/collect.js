// helper - collects all emitted events

const Collect = {
    name: "helper.collect",
    events: {
        "**"(payload, sender, event, ctx) {
            // console.log("called", {payload, sender, event, ctx});
            this.calls[event] ? this.calls[event].push({payload, sender, event, ctx}) : this.calls[event] = [{payload, sender, event, ctx}];
        }
    },
    created () {
        this.calls = (this.settings && this.settings.calls && Array.isArray(this.settings.calls)) ? this.settings.calls : [];
    }
};

function clear(calls) {
    for (let event in calls) {
        calls[event].splice(0, calls[event].length);
    }
}

module.exports = {
    Collect: Collect,
    clear: clear
};
