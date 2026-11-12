// בדיקות חשבונאיות למשיכות מזומן מתוארכות: קיזוז מההערכה המפוזרת, עוגן יתרה,
// משיכות מעבר לתקציב, סוף חודש, והפרדה מאומדן האשראי ומרישום ההוצאות בפועל.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../src/app.jsx'), 'utf8');

// חילוץ שתי הפונקציות הטהורות (כולל ההערה שביניהן) לקontext בידוד
const start = source.indexOf('function cashEstimateForMonth(');
assert.notEqual(start, -1, 'cashEstimateForMonth missing');
const end = source.indexOf('function monthsDiff', start);
assert.notEqual(end, -1, 'monthsDiff missing');
const ctx = {}; vm.createContext(ctx); vm.runInContext(source.slice(start, end), ctx);
const f = ctx.cashEstimateForMonth;
const plan = ctx.cashPlanForMonth;
assert.equal(typeof plan, 'function', 'cashPlanForMonth missing');

// --- קיזוז בסיסי ותאימות לאחור ---
assert.equal(f(1000, 0), 1000, 'ללא משיכות: ההערכה היא חלק המזומן כפי שהוא');
assert.equal(f(1000, 350), 650, 'משיכה מקוזזת: אותו כסף לא נספר פעמיים');
assert.equal(f(1000, 1200), 0, 'משיכות מעבר לחלק המזומן: ההערכה מתאפסת, לא שלילית');
assert.equal(f(1000, 1000), 0);
assert.equal(f(undefined, 350), 0);
assert.equal(f(1000, undefined), 1000);
assert.equal(f(NaN, NaN), 0);
assert.equal(f(0, 350), 0);

// --- תוכנית חודש: סינון לפי חודש ועוגן ---
const W = [
  { id: 'a', amount: 350, date: '2026-11-12' },   // בחודש, אחרי העוגן
  { id: 'b', amount: 200, date: '2026-11-03' },   // בחודש, לפני העוגן
  { id: 'c', amount: 999, date: '2026-12-01' },   // חודש אחר — לא נספר ולא מקוזז
  { id: 'd', amount: 50, date: '' },              // בלי תאריך — לא נספר
  null,                                            // רשומה פגומה — לא מפילה
];
// חודש מלא (עוגן ביום 1): שתי המשיכות של נובמבר אירועים, הסכום 550 מקוזז
let p = plan(1000, W, '2026-11', 1, 30);
assert.equal(p.total, 550);
assert.equal(p.inRangeTotal, 550);
assert.deepEqual(p.inMonth.map(w => w.id), ['a', 'b']);
assert.equal(p.estimate, 450);
// עוגן ביום 12: המשיכה מיום 3 כבר ביתרת הפתיחה — לא אירוע, אבל עדיין מקוזזת מההערכה
p = plan(1000, W, '2026-11', 12, 30);
assert.equal(p.total, 550, 'קיזוז כולל גם משיכות שקדמו לעוגן');
assert.equal(p.inRangeTotal, 350, 'רק משיכות מהעוגן והלאה יורדות כאירועים');
assert.deepEqual(p.inMonth.map(w => w.id), ['a']);
assert.equal(p.estimate, 450);
// משיכה בסוף החודש (יום 28): אותה הערכה ואותו בסיס פיזור; רק יום האירוע משתנה
p = plan(1000, [{ id: 'late', amount: 350, date: '2026-11-28' }], '2026-11', 1, 30);
assert.equal(p.estimate, 650, 'משיכה מאוחרת בחודש מקוזזת כמו כל משיכה אחרת');
assert.equal(p.inRangeTotal, 350);
assert.deepEqual(p.inMonth.map(w => w.id), ['late']);
// משיכות מעבר לתקציב: ההערכה 0, וכל הסכום יורד כאירועים מתוארכים
p = plan(1000, [{ id: 'x', amount: 700, date: '2026-11-05' }, { id: 'y', amount: 600, date: '2026-11-20' }], '2026-11', 1, 30);
assert.equal(p.estimate, 0);
assert.equal(p.inRangeTotal, 1300, 'העודף מעבר לתקציב עדיין יורד מהיתרה בתאריכי המשיכה');
// יום שחורג מאורך החודש (31 בנובמבר) נספר כמו יום 30 לצורך העוגן
p = plan(1000, [{ id: 'z', amount: 100, date: '2026-11-31' }], '2026-11', 30, 30);
assert.equal(p.inRangeTotal, 100, 'יום 31 בחודש של 30 ימים נספר בתחום');
// בלי משיכות בכלל — התנהגות מדויקת כמו לפני השינוי
p = plan(1000, [], '2026-11', 5, 30);
assert.equal(p.estimate, 1000);
assert.equal(p.inRangeTotal, 0);

// --- סיכות ברמת המקור: האשראי וההוצאות בפועל לא מושפעות ממשיכות ---
const creditLine = source.match(/const autoVariableCredit = .*/)[0];
assert(!/withdrawal/i.test(creditLine), 'אומדן האשראי של החודש הבא אינו תלוי במשיכות');
const sourceCashLine = source.match(/const sourceCash = .*/)[0];
assert(!/withdrawal/i.test(sourceCashLine), 'חלק המזומן של חודש המקור אינו תלוי במשיכות');
const balanceLine = source.match(/const balance = .*/)[0];
assert(/withdrawalsInRange/.test(balanceLine), 'המשיכות יורדות מהיתרה החודשית');
const rowsBlock = source.slice(source.indexOf('const rowsRaw = months.map'), source.indexOf('}).filter(r => r.keep)'));
assert(!/(?<![A-Za-z])expenses(?![A-Za-z])/.test(rowsBlock.replace(/plannedExpenses/g, '').replace(/fixedExpenses/g, '')),
  'רישום הוצאה בפועל אינו משנה את יתרת הבנק בתחזית');

console.log('Cash withdrawal estimate tests pass');
