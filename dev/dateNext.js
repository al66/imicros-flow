const parser = require("cron-parser");
const { Cron } = require("../lib/timer/cron.js");

try {
    let expression = "10 20 10,12,20 * *";
    let interval = parser.parseExpression(expression);
    console.log("Expression: ", expression);
    
    for(let i = 0; i < 10; i++) {
        // console.log("Date: ", interval.next().toString());
        console.log("Date: ", interval.next().toDate());
    }
    console.log("Previous Date: ", interval.prev().toString());
} catch (err) {
    console.log("Error: " + err.message);
}

try {
    let expression = "10 20 10,12,20 * *";
    let cron = new Cron(expression);
    for(let i = 0; i < 10; i++) {
        console.log("Date: ", cron.next());
    }
    const date = new Date("2019-12-11T13:00:00Z");
    console.log("Date: ", cron.next(date));
} catch (err) {
    console.log("Error: " + err.message);
}
