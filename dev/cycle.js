const { Cycle } = require("../lib/timer/cycle");


const tests = [
    "R2/2012-01-01T00:00:00Z/P1Y2D",
    "R/2012-01-01T00:00:00Z/PT3M",
    "R/2012-01-01T00:00:00+02:00/PT3M",
    "R5/2012-01-01/P40D",
    "R5/2012-01-01/P3W2D",
    "R2/2012-01-01T00:00:00Z/P1Y2DT0H3M",
    "2012-01-01T00:00:00Z",
];

for (test of tests) {
    try {
        console.log("Test", test);
        let cycle = new Cycle(test);
        console.log("VALUE", cycle.value);
        console.log("START", cycle.next());
        console.log("NEXT", cycle.next(cycle.date));
    } catch(err) {
        console.log("ERROR",err)
    }
}

