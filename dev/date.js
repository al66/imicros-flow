let time = new Date();
let wait = {
    years: 1,
    month: 5,
    days: 2,
    hours: 7,
    minutes: 50,
    seconds: 10
};
console.log(time);
console.log(wait);
if (wait) {
    if (wait.years) time.setFullYear(time.getUTCFullYear() + parseInt(wait.years));
    if (wait.month) time.setMonth(time.getUTCMonth() + parseInt(wait.month));
    if (wait.days) time.setDate(time.getUTCDate() + parseInt(wait.days));
    if (wait.hours) time.setHours(time.getUTCHours() + parseInt(wait.hours));
    if (wait.minutes) time.setMinutes(time.getUTCMinutes() + parseInt(wait.minutes));
    if (wait.seconds) time.setSeconds(time.getUTCSeconds() + parseInt(wait.seconds));
}
console.log(time);
