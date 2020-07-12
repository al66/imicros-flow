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

module.exports = {
    Collect: Collect
};
