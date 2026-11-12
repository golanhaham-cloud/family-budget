// בדיקות לקיזוז משיכות מזומן מתוארכות מההערכה החודשית המפוזרת (cashEstimateForMonth).
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require('path').join(__dirname, '../src/app.jsx'), 'utf8');
const start = source.indexOf('function cashEstimateForMonth(');
assert.notEqual(start, -1, 'cashEstimateForMonth missing');
const end = source.indexOf('function ', start + 10);
const ctx = {}; vm.createContext(ctx); vm.runInContext(source.slice(start, end), ctx);
const f = ctx.cashEstimateForMonth;

// בלי משיכות: ההערכה היא חלק המזומן של התקציב כפי שהוא (תאימות לאחור)
assert.equal(f(1000, 0), 1000);
// משיכה מקוזזת: אותו כסף לא נספר פעמיים
assert.equal(f(1000, 350), 650);
// משיכות מעבר לחלק המזומן: ההערכה מתאפסת ולא הופכת שלילית
assert.equal(f(1000, 1200), 0);
assert.equal(f(1000, 1000), 0);
// ערכים חסרים/לא תקינים לא מפילים את החישוב
assert.equal(f(undefined, 350), 0);
assert.equal(f(1000, undefined), 1000);
assert.equal(f(NaN, NaN), 0);
// הכנסה נטו של ההוצאה בפועל: תקציב 0 עם משיכה — ההערכה נשארת 0 (המשיכה עצמה אירוע מתוארך)
assert.equal(f(0, 350), 0);
console.log('Cash withdrawal estimate tests pass');
