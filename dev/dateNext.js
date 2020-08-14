const parser = require("cron-parser");


try {
    let expression = "10 20 10,12,20 * *";
    let interval = parser.parseExpression(expression);
    console.log("Expression: ", expression);
    
    for(let i = 0; i < 10; i++) {
        console.log("Date: ", interval.next().toString());
    }
    console.log("Previous Date: ", interval.prev().toString());
} catch (err) {
    console.log("Error: " + err.message);
}

