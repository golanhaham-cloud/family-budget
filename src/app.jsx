
const { useState, useEffect, useMemo, useCallback, useRef } = React;

/* ---------- design tokens ---------- */
const COLORS = {
  ink: "#14213D", paper: "#F3F6F4", card: "#FFFFFF",
  sage: "#2F6F5E", sageLight: "#E4F0EC",
  amber: "#E3A008", amberLight: "#FBF0D6",
  coral: "#E4572E", coralLight: "#FBE2DA",
  mist: "#E1E8E4", sub: "#6B7A75",
};

const DEFAULT_CATEGORIES = [
  { id: "c1", name: "סופר ומזון", icon: "🛒", active: true },
  { id: "c2", name: "מסעדות ואוכל בחוץ", icon: "🍽️", active: true },
  { id: "c3", name: "בילויים", icon: "🎉", active: true },
  { id: "c4", name: "קניות", icon: "🛍️", active: true },
  { id: "c5", name: "דלק", icon: "⛽", active: true },
  { id: "c6", name: "רכב", icon: "🚗", active: true },
  { id: "c7", name: "ילדים", icon: "🧸", active: true },
  { id: "c8", name: "בית", icon: "🏠", active: true },
  { id: "c9", name: "פארם", icon: "💊", active: true },
  { id: "c10", name: "בגדים", icon: "👕", active: true },
  { id: "c11", name: "שונות", icon: "📦", active: true },
];
const ICON_OPTIONS = ["🛒","🍽️","🎉","🛍️","⛽","🚗","🧸","🏠","💊","👕","📦","💡","📱","🎓","✈️","🐾","🎁","☕","🏋️","💇"];
const HEBREW_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const APP_VERSION = "37";
const APP_VERSION_DATE = "1.11.2026";

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function todayISO() { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }
function fmt(n) { const v = Math.round(Number(n) || 0); return `${v.toLocaleString("he-IL")} ₪`; }
function pct(spent, budget) { if (!budget || budget <= 0) return spent > 0 ? 999 : 0; return (spent / budget) * 100; }
function statusColor(p) { if (p >= 90) return COLORS.coral; if (p >= 70) return COLORS.amber; return COLORS.sage; }

/* ---------- התראות תקציב (השוואה באגורות, לפי הדיוק הכספי של המערכת) ---------- */
const NEAR_BUDGET_PCT = 80; // סף ההתקרבות הקיים
const toAgorot = (v) => Math.round((Number(v) || 0) * 100); // מנרמל שגיאות נקודה צפה (0.1+0.2) בלי לשנות את הסכום השמור
const round2 = (v) => { const n = Number(v); if (!Number.isFinite(n)) return 0; const s = n * 100; return Math.round(s + Math.sign(s) * Number.EPSILON * Math.max(100, Math.abs(s))) / 100; }; // עיגול לאגורות, חצי אגורה ומעלה מעוגל כלפי חוץ (1.005→1.01, 2.675→2.68, -2.675→-2.68); התיקון מתבצע לאחר ההזזה לאגורות ופרופורציונלי לגודל, כדי לגבור על שגיאת ייצוג בינארי בכל סדר גודל (555.555→555.56)
function fmtAgorot(ag) {
  if (ag > 0 && ag < 100) return "פחות מ־1 ₪";
  return `${(ag / 100).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₪`;
}
function categoryBudgetState(budget, spent) {
  const b = toAgorot(budget), sp = toAgorot(spent);
  if (b <= 0) return { state: "none", diffAg: 0 };
  const diff = sp - b;
  if (diff > 0) return { state: "over", diffAg: diff };
  if (diff === 0) return { state: "full", diffAg: 0 };
  if ((sp / b) * 100 >= NEAR_BUDGET_PCT) return { state: "near", diffAg: diff, pct: (sp / b) * 100 };
  return { state: "ok", diffAg: diff };
}
function buildBudgetAlerts(perCategory, paceHigh, projected) {
  const over = [], near = [], full = [];
  perCategory.forEach(c => {
    const r = categoryBudgetState(c.budget, c.spent);
    if (r.state === "over") over.push({ kind: "over", key: c.id, w: r.diffAg, text: `${c.icon} ${c.name} — חריגה של ${r.diffAg < 100 ? "פחות מ־1 ₪" : fmtAgorot(r.diffAg)}` });
    else if (r.state === "near") near.push({ kind: "near", key: c.id, w: r.pct, text: `${c.icon} ${c.name} — מתקרב לתקציב, נותרו ${fmtAgorot(-r.diffAg)}` });
    else if (r.state === "full") full.push({ kind: "full", key: c.id, w: 0, text: `${c.icon} ${c.name} — התקציב נוצל במלואו` });
  });
  over.sort((x, y) => y.w - x.w); near.sort((x, y) => y.w - x.w);
  const pace = paceHigh ? [{ kind: "pace", key: "pace", text: `קצב ההוצאות הכללי גבוה — צפי לסיים בכ־${fmt(projected)}` }] : [];
  return [...over, ...pace, ...near, ...full];
}

/* ---------- storage helpers (server API) ---------- */
const EMPTY_DATA = { categories: DEFAULT_CATEGORIES, budgets: {}, expenses: [], fixedExpenses: [], incomeEntries: [], recurringIncomes: [], plannedExpenses: [], settings: { creditLag: false, openingBalance: 0, openingBalanceDate: "", creditBillingDay: 1, variableOverrides: {}, variableOverrideMeta: {}, cashBudgets: {}, lastAdvice: null, advices: [], cards: [] } };
function normalizeData(d) {
  // נירמול שאריות נקודה צפה שנשמרו בעבר (למשל 11,378.380000000001) לשתי ספרות אחרי הנקודה.
  const moneyList = (arr, keys) => (arr || []).map(x => {
    if (!x || typeof x !== "object") return x;
    const y = { ...x };
    keys.forEach(k => { if (k in y && y[k] != null && y[k] !== "") y[k] = round2(y[k]); });
    return y;
  });
  const moneyMapVals = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, typeof v === "number" ? round2(v) : v]));
  const moneyBudgets = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, v && typeof v === "object" ? moneyMapVals(v) : v]));
  const s = d.settings || {};
  return {
    categories: d.categories || DEFAULT_CATEGORIES,
    budgets: moneyBudgets(d.budgets),
    expenses: moneyList(d.expenses, ["amount"]),
    fixedExpenses: moneyList(d.fixedExpenses, ["amount"]),
    incomeEntries: moneyList(d.incomeEntries, ["amount"]),
    recurringIncomes: moneyList(d.recurringIncomes, ["amount", "bonusAmount"]),
    plannedExpenses: moneyList(d.plannedExpenses, ["amount"]),
    settings: { creditLag: false, openingBalance: 0, openingBalanceDate: "", creditBillingDay: 1, variableOverrides: {}, variableOverrideMeta: {}, cashBudgets: {}, lastAdvice: null, advices: [], cards: [], ...s,
      openingBalance: round2(s.openingBalance),
      variableOverrides: moneyMapVals(s.variableOverrides),
      cashBudgets: moneyMapVals(s.cashBudgets) },
  };
}
// החלוקה בפועל לקטגוריות לחודש: חודש ללא רשומה מוגדרת משלו יורש את החלוקה האחרונה שהוגדרה לפניו,
// ולא את חלוקת החודש הנצפה, כדי שהמסכים לא ישתנו ממעבר בין חודשים. לא יורשים אחורה מחודש עתידי.
// רשומה "מוגדרת" היא רשומה עם ערכים בפועל: אובייקט ריק ({}) מדלגים עליה, ורשומה עם ערכים שהסכום שלהם 0
// היא תקציב אפס מכוון ונכבדת כפי שהיא. מחזיר { map, sourceKey, explicit }.
function budgetsForMonth(budgets, mKey) {
  const b = budgets || {};
  const defined = (k) => { const r = b[k]; return !!r && Object.keys(r).length > 0; };
  if (defined(mKey)) return { map: b[mKey], sourceKey: null, explicit: true };
  const [y0, m0] = mKey.split("-").map(Number);
  for (let i = 1; i <= 240; i++) {
    const k = monthKey(new Date(y0, m0 - 1 - i, 1));
    if (defined(k)) return { map: b[k], sourceKey: k, explicit: false };
  }
  // לא נמצא תקציב מוגדר באף חודש קודם: רשומה ריקה באופן קבוע, לעולם לא החלוקה של החודש הנצפה.
  return { map: {}, sourceKey: null, explicit: false };
}
function budgetTotalForMonth(budgets, categories, mKey) {
  const { map } = budgetsForMonth(budgets, mKey);
  return categories.reduce((s, c) => s + (Number(map[c.id]) || 0), 0);
}
// חלוקת מזומן/ביט לחודש: חודש ללא חלוקה מוגדרת יורש את החלוקה האחרונה שהוגדרה לפניו,
// כפי שהתקציב הכולל יורש. ערך 0 מפורש נכבד כפי שהוא (הכול אשראי באותו חודש) וחוסם את הירושה.
// מחזיר { value, sourceKey, explicit }: sourceKey הוא החודש שממנו נורש הערך, explicit כשהוגדר לחודש עצמו.
function cashBudgetForMonth(cashBudgets, mKey) {
  const cb = cashBudgets || {};
  const def = (k) => Object.prototype.hasOwnProperty.call(cb, k) && Number.isFinite(Number(cb[k])) && Number(cb[k]) >= 0;
  if (def(mKey)) return { value: Number(cb[mKey]), sourceKey: null, explicit: true };
  const [y0, m0] = mKey.split("-").map(Number);
  for (let i = 1; i <= 240; i++) {
    const k = monthKey(new Date(y0, m0 - 1 - i, 1));
    if (def(k)) return { value: Number(cb[k]), sourceKey: k, explicit: false };
  }
  return { value: 0, sourceKey: null, explicit: false };
}
function monthsDiff(aKey, bKey) {
  const [ay, am] = aKey.split("-").map(Number);
  const [by, bm] = bKey.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// תקופת תוקף חודשית (YYYY-MM, כולל קצוות). שדה ריק/לא תקין = ללא גבול, כך שרשומות ישנות מתנהגות בדיוק כמו קודם.
function isFixedInPeriod(f, mKey) {
  if (MONTH_RE.test(f.effectiveFrom || "") && mKey < f.effectiveFrom) return false;
  if (MONTH_RE.test(f.effectiveTo || "") && mKey > f.effectiveTo) return false;
  return true;
}
function isFixedApplicable(f, mKey) {
  if (f.active === false) return false;
  if (!isFixedInPeriod(f, mKey)) return false;
  const freq = f.frequencyMonths || 1;
  if (freq <= 1) return true;
  const anchor = f.anchorMonth || mKey;
  const diff = monthsDiff(anchor, mKey);
  return ((diff % freq) + freq) % freq === 0;
}
function fixedFreqLabel(freq) {
  const n = freq || 1;
  return n === 1 ? "חודשי" : n === 2 ? "דו-חודשי" : n === 12 ? "שנתי" : `כל ${n} חודשים`;
}
// בדיקת חפיפה בין תקופות של אותה הוצאה (אותו seriesId). גבול ריק = אינסוף.
function periodsOverlap(aFrom, aTo, bFrom, bTo) {
  const lo = (x) => (MONTH_RE.test(x || "") ? x : "0000-00");
  const hi = (x) => (MONTH_RE.test(x || "") ? x : "9999-99");
  return lo(aFrom) <= hi(bTo) && lo(bFrom) <= hi(aTo);
}
function validateFixedPeriod(from, to, siblings) {
  if (MONTH_RE.test(from || "") && MONTH_RE.test(to || "") && to < from) return "חודש הסיום לא יכול להיות לפני חודש ההתחלה";
  const clash = (siblings || []).find(x => periodsOverlap(from, to, x.effectiveFrom, x.effectiveTo));
  if (clash) return "התקופה חופפת להגדרה אחרת של אותה הוצאה, והסכום היה נספר פעמיים";
  return "";
}
function validateAmountChange(f, fromMonth, newAmount) {
  if (!MONTH_RE.test(fromMonth || "")) return "יש לבחור חודש";
  if (!(Number(newAmount) > 0)) return "הסכום החדש חייב להיות גדול מאפס";
  if (Number(newAmount) === Number(f.amount)) return "הסכום החדש זהה לסכום הנוכחי";
  if (MONTH_RE.test(f.effectiveFrom || "") && fromMonth <= f.effectiveFrom) return "חודש השינוי חייב להיות אחרי חודש ההתחלה של ההגדרה הנוכחית";
  if (MONTH_RE.test(f.effectiveTo || "") && fromMonth > f.effectiveTo) return "חודש השינוי חורג מתקופת התוקף של ההגדרה";
  return "";
}
function fixedTotalForMonth(fixedExpenses, mKey) {
  return fixedExpenses.filter(f => isFixedApplicable(f, mKey)).reduce((s, f) => s + Number(f.amount || 0), 0);
}
function prevMonthKey(mKey) {
  const [y, m] = mKey.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return monthKey(d);
}
// For forecasting cash flow: direct-debit fixed items charge in their own month on dueDay.
// Fixed items marked onCredit were incurred in the PREVIOUS month and land on the credit billing day this month.
function fixedForecastItemsForMonth(fixedExpenses, mKey) {
  const direct = fixedExpenses.filter(f => f.active !== false && !f.onCredit && isFixedApplicable(f, mKey));
  const prevKey = prevMonthKey(mKey);
  // רק הגדרה גלובלית: הוצאות עם cardId מחושבות בנפרד לפי הגדרות הכרטיס (cardForecastForMonth)
  const creditFromPrev = fixedExpenses.filter(f => f.active !== false && f.onCredit && !f.cardId && isFixedApplicable(f, prevKey));
  return { direct, creditFromPrev };
}

/* ---------- כרטיסי אשראי (תוספתי: settings.cards, fixedExpenses[].cardId אופציונלי) ---------- */
function shiftMonthKey(mKey, delta) { const [y, m] = mKey.split("-").map(Number); return monthKey(new Date(y, m - 1 + delta, 1)); }
// כרטיס "שלם" רק אם הוגדרו במפורש גם יום חיוב (1-31) וגם lag (0-6 חודשים אחרי חודש ההוצאה). אין ברירות מחדל.
function isCardComplete(c) {
  return !!c && Number.isInteger(c.billingDay) && c.billingDay >= 1 && c.billingDay <= 31 && Number.isInteger(c.lag) && c.lag >= 0 && c.lag <= 6;
}
function cardMissingSettings(c) {
  if (!c) return "הכרטיס לא קיים";
  const miss = [];
  if (!(Number.isInteger(c.billingDay) && c.billingDay >= 1 && c.billingDay <= 31)) miss.push("יום חיוב");
  if (!(Number.isInteger(c.lag) && c.lag >= 0 && c.lag <= 6)) miss.push("חודש החיוב");
  return miss.length ? "חסר: " + miss.join(" ו") : "";
}
const sumAmt = (items) => items.reduce((t, f) => t + (Number(f.amount) || 0), 0);
// הוצאות קבועות באשראי המשויכות לכרטיס, לחודש תחזית mKey.
// scheduled: כרטיס מוגדר במלואו - ההוצאות של חודש (mKey - lag) יורדות ביום החיוב של הכרטיס ב-mKey.
// unscheduled: חסרה הגדרה (או כרטיס לא קיים) - הסכום הידוע של הוצאות חודש mKey, ללא תזמון וללא ניחוש.
function cardForecastForMonth(fixedExpenses, cards, mKey) {
  const list = cards || [];
  const cardItems = fixedExpenses.filter(f => f.active !== false && f.onCredit && f.cardId);
  const ids = []; cardItems.forEach(f => { if (!ids.includes(f.cardId)) ids.push(f.cardId); });
  const scheduled = [], unscheduled = [];
  ids.forEach(id => {
    const card = list.find(c => c.id === id);
    if (isCardComplete(card)) {
      const items = cardItems.filter(f => f.cardId === id && isFixedApplicable(f, shiftMonthKey(mKey, -card.lag)));
      if (items.length) scheduled.push({ card, items, total: sumAmt(items), day: card.billingDay });
    } else {
      const items = cardItems.filter(f => f.cardId === id && isFixedApplicable(f, mKey));
      if (items.length) unscheduled.push({ cardId: id, name: card ? (card.name || "כרטיס ללא שם") : "כרטיס לא מוכר", why: cardMissingSettings(card), items, total: sumAmt(items) });
    }
  });
  return { scheduled, unscheduled };
}

/* ---------- הכנסות קבועות (תוספתי: recurringIncomes, incomeEntries[].recurringIncomeId אופציונלי) ---------- */
const isEmptyVal = (v) => v === "" || v === null || v === undefined;
function daysInMonthKey(mKey) { const [y, m] = mKey.split("-").map(Number); return new Date(y, m, 0).getDate(); }
// הכנסה קבועה חלה בחודש אם הוא בתוך [startMonth, endMonth] (קצוות כלולים). בחודש בונוס bonusAmount מחליף את הסכום הרגיל במלואו.
// חודש בונוס = חודש העוגן עצמו ואז כל N חודשים אחריו, אף פעם לא לפניו (בדומה ל-anchorMonth בהוצאות קבועות).
function recurringIncomeForMonth(r, mKey) {
  if (!MONTH_RE.test(r.startMonth || "") || mKey < r.startMonth) return null;
  if (MONTH_RE.test(r.endMonth || "") && mKey > r.endMonth) return null;
  let amount = Number(r.amount) || 0, bonus = false;
  const n = Number(r.bonusEveryMonths);
  if (!isEmptyVal(r.bonusAmount) && Number.isInteger(n) && n >= 1 && MONTH_RE.test(r.bonusAnchorMonth || "")
      && mKey >= r.bonusAnchorMonth && monthsDiff(r.bonusAnchorMonth, mKey) % n === 0) { amount = Number(r.bonusAmount) || 0; bonus = true; }
  return { amount, bonus, day: Math.min(Math.max(Math.floor(Number(r.day)) || 1, 1), daysInMonthKey(mKey)) };
}
// הקישור הוא לפי recurringIncomeId בלבד. רשומה ידנית מקושרת באותו חודש מחליפה את הקבועה (גם בסכום 0) ולכן הקבועה לא נספרת שוב.
function recurringIncomeItemsForMonth(recurringIncomes, incomeEntries, mKey) {
  const items = [], overridden = [];
  (recurringIncomes || []).forEach(r => {
    const calc = recurringIncomeForMonth(r, mKey);
    if (!calc) return;
    const ov = incomeEntries.find(e => e.recurringIncomeId === r.id && e.monthKey === mKey);
    if (ov) overridden.push({ r, entry: ov, calc });
    else items.push({ r, ...calc });
  });
  return { items, overridden };
}
function validateRecurringIncome(x) {
  if (!String(x.name || "").trim()) return "יש להזין שם להכנסה";
  const amt = Number(x.amount);
  if (isEmptyVal(x.amount) || !Number.isFinite(amt) || amt < 0) return "הסכום חייב להיות מספר גדול או שווה לאפס";
  const day = Number(x.day);
  if (isEmptyVal(x.day) || !Number.isInteger(day) || day < 1 || day > 31) return "היום בחודש חייב להיות מספר שלם בין 1 ל־31";
  if (!MONTH_RE.test(x.startMonth || "")) return "יש לבחור חודש התחלה";
  if (!isEmptyVal(x.endMonth)) {
    if (!MONTH_RE.test(x.endMonth)) return "חודש הסיום אינו תקין";
    if (x.endMonth < x.startMonth) return "חודש הסיום לא יכול להיות לפני חודש ההתחלה";
  }
  const filled = [x.bonusAmount, x.bonusEveryMonths, x.bonusAnchorMonth].filter(v => !isEmptyVal(v)).length;
  if (filled !== 0 && filled !== 3) return "שדות הבונוס (סכום, תדירות ועוגן) חייבים להיות מלאים יחד או ריקים יחד";
  if (filled === 3) {
    const b = Number(x.bonusAmount), n = Number(x.bonusEveryMonths);
    if (!Number.isFinite(b) || b < 0) return "סכום הבונוס חייב להיות מספר גדול או שווה לאפס";
    if (!Number.isInteger(n) || n < 1) return "תדירות הבונוס חייבת להיות מספר שלם חיובי של חודשים";
    if (!MONTH_RE.test(x.bonusAnchorMonth)) return "חודש העוגן של הבונוס אינו תקין";
  }
  return "";
}
function validateIncomeOverride(rid, mKey, amount, incomeEntries) {
  if (incomeEntries.some(e => e.recurringIncomeId === rid && e.monthKey === mKey)) return "כבר קיימת דריסה של ההכנסה הקבועה הזו בחודש הזה";
  if (isEmptyVal(amount) || !Number.isFinite(Number(amount)) || Number(amount) < 0) return "הסכום חייב להיות מספר גדול או שווה לאפס (0 מדלג על החודש)";
  return "";
}
// קישור רשומות קיימות: רק שדה recurringIncomeId. חוסם בחירה שתיצור שתי רשומות מקושרות לאותו חודש, בלי לבחור בשבילך.
function validateIncomeLink(rid, ids, incomeEntries) {
  const chosen = incomeEntries.filter(e => ids.includes(e.id));
  if (chosen.some(e => e.recurringIncomeId)) return "אחת הרשומות כבר מקושרת להכנסה קבועה";
  const seen = {};
  for (const e of chosen) {
    if (seen[e.monthKey]) return `נבחרו שתי רשומות לאותו חודש (${monthLabelOf(e.monthKey)}). בחר רשומה אחת לכל חודש`;
    seen[e.monthKey] = true;
    if (incomeEntries.some(x => x.recurringIncomeId === rid && x.monthKey === e.monthKey)) return `בחודש ${monthLabelOf(e.monthKey)} כבר קיימת רשומה מקושרת להכנסה הזו`;
  }
  return "";
}

let DATA_VERSION = 0;
const API_GET = { credentials: "same-origin", headers: { "X-Requested-With": "fb" } };
async function loadAppData() {
  try {
    const res = await fetch("/api/data", API_GET);
    if (res.status === 401) return { status: "unauthorized" };
    if (!res.ok) return { status: "error" };
    const json = await res.json();
    DATA_VERSION = json.version || 0;
    return { status: "ok", data: json.data ? normalizeData(json.data) : EMPTY_DATA };
  } catch (e) { console.error(e); return { status: "error" }; }
}
async function saveAppData(data) {
  try {
    const res = await fetch("/api/data", {
      method: "PUT", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "fb" },
      body: JSON.stringify({ baseVersion: DATA_VERSION, data }),
    });
    if (res.ok) { DATA_VERSION = (await res.json()).version; return "ok"; }
    if (res.status === 409) return "conflict";
    if (res.status === 401) return "unauthorized";
    if (res.status === 429) return "rate";
    return "error";
  } catch (e) { console.error(e); return "error"; }
}
async function loginRequest(passcode) {
  const res = await fetch("/api/login", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fb" },
    body: JSON.stringify({ passcode }),
  });
  return { ok: res.ok, status: res.status };
}

async function logoutRequest() {
  try { await fetch("/api/logout", { method: "POST", credentials: "same-origin", headers: { "X-Requested-With": "fb" } }); } catch (e) {}
  location.reload();
}

/* ---------- small UI atoms ---------- */
function RingGauge({ percent, size = 108, stroke = 11, color }) {
  const clamped = Math.min(percent, 100);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.mist} strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
}
function ProgressBar({ percent, color }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: COLORS.mist, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(percent, 100)}%`, background: color, borderRadius: 999, transition: "width 0.5s ease" }} />
    </div>
  );
}
/* simple dependency-free charts */
function BudgetVsActualChart({ data }) {
  const max = Math.max(1, ...data.map(d => Math.max(d.budget, d.spent)));
  return (
    <div>
      {data.map((d, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, color: COLORS.sub, marginBottom: 3 }}>{d.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <div style={{ flex: 1, height: 8, background: COLORS.mist, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${(d.budget / max) * 100}%`, height: "100%", background: COLORS.mist2 || "#B9C6C0", borderRadius: 999 }} />
            </div>
            <span style={{ fontSize: 10, color: COLORS.sub, width: 54, textAlign: "left" }}>{fmt(d.budget)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, height: 8, background: COLORS.mist, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${(d.spent / max) * 100}%`, height: "100%", background: COLORS.sage, borderRadius: 999 }} />
            </div>
            <span style={{ fontSize: 10, color: COLORS.ink, width: 54, textAlign: "left", fontWeight: 700 }}>{fmt(d.spent)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
const PIE_COLORS = [COLORS.sage, COLORS.amber, COLORS.coral, "#4A90A4", "#8E7CC3", "#D4A373", "#6B9080", "#C9184A", "#457B9D", "#B08968", "#588157"];
function DonutChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const stops = data.map((d, i) => {
    const start = (acc / total) * 360;
    acc += d.value;
    const end = (acc / total) * 360;
    return `${PIE_COLORS[i % PIE_COLORS.length]} ${start}deg ${end}deg`;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{
        width: 160, height: 160, borderRadius: "50%",
        background: `conic-gradient(${stops.join(",")})`,
        position: "relative"
      }}>
        <div style={{ position: "absolute", inset: 30, borderRadius: "50%", background: COLORS.card }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 12 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: COLORS.sub }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: PIE_COLORS[i % PIE_COLORS.length] }} />
            {d.name}
          </div>
        ))}
      </div>
    </div>
  );
}
function CumulativeLineChart({ points, budget }) {
  if (points.length < 2) return null;
  const w = 300, h = 130, pad = 8;
  const maxY = Math.max(budget || 0, ...points.map(p => p.spent), 1);
  const stepX = (w - pad * 2) / (points.length - 1);
  const toXY = (p, i) => [pad + i * stepX, h - pad - (p.spent / maxY) * (h - pad * 2)];
  const path = points.map((p, i) => toXY(p, i)).map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const budgetY = h - pad - ((budget || 0) / maxY) * (h - pad * 2);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {budget > 0 && <line x1={pad} y1={budgetY} x2={w - pad} y2={budgetY} stroke={COLORS.coral} strokeDasharray="4 4" strokeWidth="1.5" />}
      <path d={path} fill="none" stroke={COLORS.sage} strokeWidth="2.5" />
    </svg>
  );
}

/* ================= LOGIN SCREEN ================= */
function LoginScreen({ onLoggedIn }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (!pass || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await loginRequest(pass);
      if (r.ok) { setPass(""); onLoggedIn(); return; }
      setErr(r.status === 429 ? "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות." : r.status === 503 ? "הכניסה עדיין לא הוגדרה בשרת." : "קוד שגוי");
    } catch (e2) { setErr("אין חיבור לשרת. נסו שוב."); }
    setBusy(false);
  };
  return (
    <div style={{ minHeight: "100vh", background: COLORS.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={submit} style={{ background: COLORS.card, borderRadius: 20, padding: 26, width: "100%", maxWidth: 380, boxShadow: "0 8px 30px rgba(20,33,61,0.08)" }}>
        <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 800, fontSize: 20, color: COLORS.ink, marginBottom: 6 }}>כניסה</div>
        <div style={{ color: COLORS.sub, fontSize: 13.5, marginBottom: 16 }}>הזינו את קוד הכניסה המשפחתי.</div>
        <input type="password" autoComplete="current-password" aria-label="קוד כניסה" value={pass} onChange={(e) => setPass(e.target.value)}
          style={{ width: "100%", height: 46, borderRadius: 12, border: `1.5px solid ${COLORS.mist}`, padding: "0 12px", fontSize: 16, marginBottom: 12 }} />
        <button type="submit" disabled={busy || !pass} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: COLORS.sage, color: "#fff", fontWeight: 800, fontSize: 15, opacity: busy || !pass ? 0.6 : 1 }}>{busy ? "בודק…" : "כניסה"}</button>
        {err && <div role="alert" style={{ marginTop: 12, fontSize: 13, color: COLORS.coral }}>{err}</div>}
      </form>
    </div>
  );
}

/* ================= APP ================= */
function BudgetApp() {
  const [authState, setAuthState] = useState("loading");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(EMPTY_DATA);
  const [user, setUser] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [monthDate, setMonthDate] = useState(new Date());
  const [tab, setTab] = useState("dashboard");
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [toast, setToast] = useState(null);
  const [pendingRestore, setPendingRestore] = useState(null);

  const reload = useCallback(async () => {
    const r = await loadAppData();
    if (r.status === "ok") { setData(r.data); setAuthState("ready"); }
    else setAuthState(r.status === "unauthorized" ? "login" : "error");
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const persist = useCallback(async (next) => {
    const prev = dataRef.current;
    setData(next);
    const r = await saveAppData(next);
    if (r === "ok") return true;
    if (r === "conflict") { showToast("הנתונים עודכנו ממכשיר אחר. טוען מחדש, נסו שוב."); await reload(); }
    else if (r === "unauthorized") { setAuthState("login"); }
    else if (r === "rate") { setData(prev); showToast("הגעתם למגבלת השמירות. נסו שוב מאוחר יותר."); }
    else { setData(prev); showToast("השמירה נכשלה. השינוי לא נשמר, נסו שוב."); }
    return false;
  }, [reload]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const mKey = monthKey(monthDate);
  const activeCategories = useMemo(() => data.categories.filter(c => c.active !== false), [data.categories]);
  const monthBudgets = data.budgets[mKey] || {};
  // החלוקה בפועל לחודש (כולל ירושה מחודש קודם, כמו בתחזית): הדשבורד, ההתראות, הייעוץ ומסך התקציב עובדים מולה.
  const budgetInfo = useMemo(() => budgetsForMonth(data.budgets, mKey), [data.budgets, mKey]);
  const effectiveBudgets = budgetInfo.map;
  const budgetSourceLabel = !budgetInfo.explicit && budgetInfo.sourceKey ? monthLabelOf(budgetInfo.sourceKey) : null;
  const monthExpenses = useMemo(() => data.expenses.filter(e => e.date && e.date.startsWith(mKey)), [data.expenses, mKey]);

  const totalBudget = activeCategories.reduce((s, c) => s + (Number(effectiveBudgets[c.id]) || 0), 0);
  const totalSpent = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const remaining = totalBudget - totalSpent;
  const overallPct = pct(totalSpent, totalBudget);
  const activeFixed = data.fixedExpenses.filter(f => f.active !== false);
  const totalFixed = fixedTotalForMonth(data.fixedExpenses, mKey);
  const monthPlanned = useMemo(() => data.plannedExpenses.filter(p => p.date && p.date.startsWith(mKey)), [data.plannedExpenses, mKey]);
  const totalPlanned = monthPlanned.reduce((s, p) => s + Number(p.amount || 0), 0);

  const now = new Date();
  const isCurrentMonth = mKey === monthKey(now);
  const dim = daysInMonth(monthDate);
  const daysPassed = isCurrentMonth ? now.getDate() : dim;
  const daysLeft = isCurrentMonth ? dim - now.getDate() + 1 : 0; // כולל היום הנוכחי: ביום האחרון בחודש נותר יום 1
  const timePct = (daysPassed / dim) * 100;
  const projected = daysPassed > 0 ? (totalSpent / daysPassed) * dim : 0;
  const paceHigh = totalBudget > 0 && overallPct - timePct > 12 && isCurrentMonth;

  const perCategory = useMemo(() => activeCategories.map(c => {
    const budget = Number(effectiveBudgets[c.id]) || 0;
    const spent = monthExpenses.filter(e => e.categoryId === c.id).reduce((s, e) => s + Number(e.amount || 0), 0);
    return { ...c, budget, spent, percent: pct(spent, budget), remaining: budget - spent };
  }), [activeCategories, effectiveBudgets, monthExpenses]);

  const alerts = useMemo(() => buildBudgetAlerts(perCategory, paceHigh, projected), [perCategory, paceHigh, projected]);

  const changeMonth = (delta) => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + delta, 1));

  const copyPrevBudget = async () => {
    const prev = new Date(monthDate); prev.setMonth(prev.getMonth() - 1);
    // החודש הקודם עצמו יכול לרשת תקציב מחודש מוקדם יותר - מעתיקים את החלוקה האפקטיבית שלו, לא רק רשומה מפורשת
    const prevInfo = budgetsForMonth(data.budgets, monthKey(prev));
    const prevBudget = prevInfo.map;
    if (!prevBudget || Object.keys(prevBudget).length === 0) { showToast("אין תקציב לחודש הקודם"); return; }
    if (await persist({ ...data, budgets: { ...data.budgets, [mKey]: { ...prevBudget } } })) showToast("התקציב הועתק מהחודש הקודם");
  };
  const setCategoryBudget = async (catId, amount) => {
    // עריכה ראשונה בחודש יורש: מממשים את החלוקה שנמשכה כבסיס, כדי ששינוי קטגוריה אחת לא יאפס את האחרות.
    const base = budgetInfo.explicit ? (data.budgets[mKey] || {}) : effectiveBudgets;
    await persist({ ...data, budgets: { ...data.budgets, [mKey]: { ...base, [catId]: round2(amount) } } });
  };
  const addCategory = async (name, icon) => { await persist({ ...data, categories: [...data.categories, { id: uid(), name, icon, active: true }] }); };
  const updateCategory = async (id, patch) => { await persist({ ...data, categories: data.categories.map(c => c.id === id ? { ...c, ...patch } : c) }); };
  const removeCategory = async (id) => { await persist({ ...data, categories: data.categories.map(c => c.id === id ? { ...c, active: false } : c) }); };

  const saveExpense = async (exp) => {
    const clean = { ...exp, amount: round2(exp.amount) };
    const next = clean.id
      ? { ...data, expenses: data.expenses.map(e => e.id === clean.id ? clean : e) }
      : { ...data, expenses: [...data.expenses, { ...clean, id: uid(), createdAt: Date.now() }] };
    if (!(await persist(next))) return;
    setShowAddExpense(false); setEditExpense(null);
    showToast("ההוצאה נשמרה");
  };
  const restoreBackup = async (file) => {
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { showToast("הקובץ אינו גיבוי תקין"); return; }
    if (!obj || !Array.isArray(obj.categories) || !Array.isArray(obj.expenses) || !Array.isArray(obj.fixedExpenses)) { showToast("הקובץ אינו גיבוי תקין"); return; }
    setPendingRestore(obj);
  };
  const confirmRestore = async () => {
    const obj = pendingRestore; setPendingRestore(null);
    if (obj && await persist(obj)) { await reload(); showToast("הנתונים שוחזרו מהגיבוי"); }
  };
  const deleteExpense = async (id) => { const saved = await persist({ ...data, expenses: data.expenses.filter(e => e.id !== id) }); if (saved) showToast("ההוצאה נמחקה"); return saved; };

  const addFixedExpense = async (name, amount, dueDay, frequencyMonths, anchorMonth, effectiveFrom, effectiveTo, onCredit, cardId) => {
    const period = {}; if (onCredit) { period.onCredit = true; if (cardId) period.cardId = cardId; } if (effectiveFrom) period.effectiveFrom = effectiveFrom; if (effectiveTo) period.effectiveTo = effectiveTo;
    await persist({ ...data, fixedExpenses: [...data.fixedExpenses, { id: uid(), name, amount: round2(amount), dueDay, frequencyMonths: frequencyMonths || 1, anchorMonth: anchorMonth || monthKey(new Date()), active: true, ...period }] });
  };
  const updateFixedExpense = async (id, patch) => {
    await persist({ ...data, fixedExpenses: data.fixedExpenses.map(f => f.id === id ? { ...f, ...patch } : f) });
  };
  // שינוי סכום החל מחודש: ההגדרה הקיימת נשמרת עד החודש שלפני, והחדשה מתחילה מהחודש שנבחר (פעולה אחת, בלי חפיפה ובלי דריסת העבר)
  const splitFixedExpense = async (id, fromMonth, newAmount) => {
    const old = data.fixedExpenses.find(f => f.id === id);
    if (!old || validateAmountChange(old, fromMonth, newAmount)) return;
    const sid = old.seriesId || old.id;
    const oldRec = { ...old, seriesId: sid, effectiveTo: prevMonthKey(fromMonth) };
    const newRec = { ...old, id: uid(), seriesId: sid, amount: Number(newAmount), effectiveFrom: fromMonth, effectiveTo: old.effectiveTo || null };
    await persist({ ...data, fixedExpenses: [...data.fixedExpenses.map(f => f.id === id ? oldRec : f), newRec] });
  };
  const removeFixedExpense = async (id) => {
    await persist({ ...data, fixedExpenses: data.fixedExpenses.filter(f => f.id !== id) });
  };

  const addIncome = async (monthK, source, amount, day) => {
    await persist({ ...data, incomeEntries: [...data.incomeEntries, { id: uid(), monthKey: monthK, source, amount: round2(amount), day: day || 1 }] });
  };
  const saveRecurringIncomes = async (list) => {
    await persist({ ...data, recurringIncomes: list });
  };
  const addIncomeOverride = async (rid, monthK, amount, day) => {
    const r = (data.recurringIncomes || []).find(x => x.id === rid);
    if (!r || validateIncomeOverride(rid, monthK, amount, data.incomeEntries)) return;
    await persist({ ...data, incomeEntries: [...data.incomeEntries, { id: uid(), monthKey: monthK, source: r.name, amount: round2(Number(amount)), day: day || r.day, recurringIncomeId: rid }] });
  };
  const linkIncomeEntries = async (rid, ids) => {
    if (!(data.recurringIncomes || []).some(x => x.id === rid) || !ids.length || validateIncomeLink(rid, ids, data.incomeEntries)) return;
    await persist({ ...data, incomeEntries: data.incomeEntries.map(e => ids.includes(e.id) ? { ...e, recurringIncomeId: rid } : e) });
  };
  const saveCards = async (cards) => {
    await persist({ ...data, settings: { ...data.settings, cards } });
  };
  const setCreditBillingDay = async (day) => {
    await persist({ ...data, settings: { ...data.settings, creditBillingDay: day } });
  };
  const setVariableOverride = async (mKey, val) => {
    const next = { ...(data.settings.variableOverrides || {}) };
    const metaNext = { ...(data.settings.variableOverrideMeta || {}) };
    if (val === null || val === undefined) { delete next[mKey]; delete metaNext[mKey]; }
    else next[mKey] = round2(val);
    await persist({ ...data, settings: { ...data.settings, variableOverrides: next, variableOverrideMeta: metaNext } });
  };
  // מטה של חיוב אשראי ידני: סטטוס (חלקי/סופי) והערה קצרה. תצוגה בלבד - אין שינוי בחישוב.
  const setVariableOverrideMeta = async (mKey, patch) => {
    const next = { ...(data.settings.variableOverrideMeta || {}) };
    const merged = { status: "", note: "", ...(next[mKey] || {}), ...patch };
    if (!merged.status && !merged.note) delete next[mKey];
    else next[mKey] = merged;
    await persist({ ...data, settings: { ...data.settings, variableOverrideMeta: next } });
  };
  // חלוקת התקציב המשתנה לפי אמצעי תשלום: הסכום ששולם במזומן/ביט יורד מהבנק באותו חודש, והשאר בחיוב האשראי.
  // ריק מוחק את החלוקה של החודש (והוא יורש את החלוקה האחרונה שהוגדרה לפניו); 0 מפורש = הכול אשראי באותו חודש וחוסם את הירושה.
  const setCashBudget = async (mKey, val) => {
    const next = { ...(data.settings.cashBudgets || {}) };
    if (val === null || val === undefined || !(Number(val) >= 0)) delete next[mKey];
    else next[mKey] = round2(val);
    await persist({ ...data, settings: { ...data.settings, cashBudgets: next } });
  };
  // שמירת ניתוח: תמיד על הנתונים העדכניים ביותר (ולא על עותק ישן מזמן שליחת הבקשה), כדי שתשובה שחזרה באיחור לא תדרוס שינויים.
  const dataRef = useRef(data);
  dataRef.current = data;
  const saveAdvice = async (entry) => {
    const cur = dataRef.current;
    const list = [entry, ...((cur.settings && cur.settings.advices) || [])].slice(0, 40);
    await persist({ ...cur, settings: { ...cur.settings, advices: list } });
  };
  const removeIncome = async (id) => {
    await persist({ ...data, incomeEntries: data.incomeEntries.filter(i => i.id !== id) });
  };

  const addPlanned = async (name, amount, date) => {
    await persist({ ...data, plannedExpenses: [...data.plannedExpenses, { id: uid(), name, amount: round2(amount), date }] });
  };
  const removePlanned = async (id) => {
    await persist({ ...data, plannedExpenses: data.plannedExpenses.filter(p => p.id !== id) });
  };

  const toggleCreditLag = async () => {
    await persist({ ...data, settings: { ...data.settings, creditLag: !data.settings.creditLag } });
  };
  const setOpeningBalance = async (val) => {
    await persist({ ...data, settings: { ...data.settings, openingBalance: round2(val) } });
  };
  const setOpeningBalanceDate = async (val) => {
    await persist({ ...data, settings: { ...data.settings, openingBalanceDate: val || "" } });
  };

  if (authState === "login") return <LoginScreen onLoggedIn={() => { setLoading(true); reload(); }} />;
  if (authState === "error") return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.paper, color: COLORS.coral, padding: 20, textAlign: "center" }}>לא ניתן לטעון את הנתונים. רעננו את הדף ונסו שוב.</div>;

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.paper }}><div style={{ color: COLORS.sub }}>טוען…</div></div>;
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: COLORS.card, borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 8px 30px rgba(20,33,61,0.08)" }}>
          <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 800, fontSize: 24, color: COLORS.ink, marginBottom: 4 }}>האתר הפיננסי של משפחת חכם</div>
          <div style={{ color: COLORS.sub, fontSize: 14, marginBottom: 20 }}>מי אתה?</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {["גולן", "צליל"].map(n => (
              <button key={n} onClick={() => setUser(n)} style={{
                flex: 1, padding: "12px 8px", borderRadius: 12, border: `2px solid ${nameDraft === n ? COLORS.sage : COLORS.mist}`,
                background: nameDraft === n ? COLORS.sageLight : "#fff", color: COLORS.ink, fontWeight: 600, fontSize: 14, cursor: "pointer"
              }}>{n}</button>
            ))}
          </div>
          <input placeholder="או הקלד/י שם משלך" value={["גולן", "צליל"].includes(nameDraft) ? "" : nameDraft} onChange={e => setNameDraft(e.target.value)}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.mist}`, fontSize: 14, marginBottom: 16, boxSizing: "border-box" }} />
          <button disabled={!nameDraft.trim()} onClick={() => setUser(nameDraft.trim())} style={{
            width: "100%", padding: "13px", borderRadius: 12, border: "none", background: nameDraft.trim() ? COLORS.sage : COLORS.mist,
            color: "#fff", fontWeight: 700, fontSize: 15, cursor: nameDraft.trim() ? "pointer" : "default"
          }}>כניסה</button>
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 11, color: COLORS.sub }}>גרסה {APP_VERSION} · עודכן {APP_VERSION_DATE}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.paper, color: COLORS.ink, paddingBottom: 90 }}>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: COLORS.paper, paddingTop: 14, paddingBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
          <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 800, fontSize: 20 }}>תקציב המשפחה</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.card, borderRadius: 10, padding: "6px 10px", fontSize: 13, color: COLORS.sub }}>👤 {user}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 10 }}>
          <button onClick={() => changeMonth(1)} aria-label="החודש הבא" style={{ ...navBtnStyle, width: 44, height: 44 }}>›</button>
          <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 17, minWidth: 140, textAlign: "center" }}>{HEBREW_MONTHS[monthDate.getMonth()]} {monthDate.getFullYear()}</div>
          <button onClick={() => changeMonth(-1)} aria-label="החודש הקודם" style={{ ...navBtnStyle, width: 44, height: 44 }}>‹</button>
        </div>
      </div>

      <div style={{ padding: "10px 16px 0" }}>
        {tab === "dashboard" && (
          <Dashboard totalBudget={totalBudget} totalSpent={totalSpent} remaining={remaining} overallPct={overallPct} budgetSourceLabel={budgetSourceLabel}
            daysLeft={daysLeft} isCurrentMonth={isCurrentMonth} projected={projected} paceHigh={paceHigh}
            perCategory={perCategory} alerts={alerts} expenses={monthExpenses} categories={activeCategories} dim={dim}
            allExpenses={data.expenses} settings={data.settings} fixedExpenses={data.fixedExpenses} realNowKey={monthKey(now)}
            onEditExpense={setEditExpense} onDeleteExpense={deleteExpense} onShowAllExpenses={() => setTab("expenses")} />
        )}
        {tab === "expenses" && <ExpensesTab key={mKey} expenses={data.expenses} categories={data.categories} selectedMonth={mKey} onEdit={setEditExpense} />}
        {tab === "more" && <MoreMenu onPick={setTab} onRestore={restoreBackup} onLogout={logoutRequest} />}
        {(tab === "fixed" || tab === "budget" || tab === "advice") && (
          <button onClick={() => setTab("more")} style={{ border: "none", background: "none", color: COLORS.sage, fontWeight: 700, fontSize: 13.5, cursor: "pointer", padding: "2px 0 10px", display: "block" }}>‹ חזרה ל"עוד"</button>
        )}
        {tab === "fixed" && (
          <FixedExpensesTab fixedExpenses={data.fixedExpenses} onAdd={addFixedExpense} onUpdate={updateFixedExpense} onRemove={removeFixedExpense} onSplit={splitFixedExpense} cards={data.settings.cards || []}
            plannedExpenses={data.plannedExpenses} onAddPlanned={addPlanned} onRemovePlanned={removePlanned} monthDate={monthDate} />
        )}
        {tab === "forecast" && (
          <ForecastTab monthDate={monthDate} totalBudget={totalBudget} fixedExpenses={data.fixedExpenses} plannedExpenses={data.plannedExpenses}
            incomeEntries={data.incomeEntries} onAddIncome={addIncome} onRemoveIncome={removeIncome}
            budgets={data.budgets} categories={activeCategories} creditLag={data.settings.creditLag} onToggleCreditLag={toggleCreditLag}
            openingBalance={data.settings.openingBalance} onSetOpeningBalance={setOpeningBalance}
            openingBalanceDate={data.settings.openingBalanceDate || ""} onSetOpeningBalanceDate={setOpeningBalanceDate}
            creditBillingDay={data.settings.creditBillingDay} onSetCreditBillingDay={setCreditBillingDay}
            cards={data.settings.cards || []} onSaveCards={saveCards}
            recurringIncomes={data.recurringIncomes || []} onSaveRecurring={saveRecurringIncomes} onAddOverride={addIncomeOverride} onLinkEntries={linkIncomeEntries}
            variableOverrides={data.settings.variableOverrides} onSetVariableOverride={setVariableOverride}
            variableOverrideMeta={data.settings.variableOverrideMeta || {}} onSetVariableOverrideMeta={setVariableOverrideMeta}
            cashBudgets={data.settings.cashBudgets || {}} />
        )}
        {tab === "budget" && (
          <BudgetTab key={mKey} categories={data.categories} monthBudgets={monthBudgets} budgetInfo={budgetInfo} onSetBudget={setCategoryBudget}
            onAddCategory={addCategory} onUpdateCategory={updateCategory} onRemoveCategory={removeCategory} onCopyPrev={copyPrevBudget}
            cashInfo={cashBudgetForMonth(data.settings.cashBudgets || {}, mKey)} onSetCashBudget={(v) => setCashBudget(mKey, v)}
            effectiveTotalBudget={budgetTotalForMonth(data.budgets, activeCategories, mKey)} />
        )}
        {tab === "advice" && <AdviceTab key={mKey} monthDate={monthDate} perCategory={perCategory} totalBudget={totalBudget} totalSpent={totalSpent}
          fixedExpenses={activeFixed.filter(f => isFixedInPeriod(f, mKey))} advices={data.settings.advices || []} legacyAdvice={data.settings.lastAdvice} onSaved={saveAdvice} />}
      </div>

      <div style={{ position: "fixed", bottom: 0, right: 0, left: 0, background: COLORS.card, borderTop: `1px solid ${COLORS.mist}`, display: "flex", alignItems: "center", zIndex: 25, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <NavBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon="▦" label="ראשי" />
        <NavBtn active={tab === "forecast"} onClick={() => setTab("forecast")} icon="📈" label="תחזית" />
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <button onClick={() => setShowAddExpense(true)} aria-label="הוצאה חדשה" style={{ width: 54, height: 54, marginTop: -22, borderRadius: 999, border: "none", background: COLORS.sage, color: "#fff", fontSize: 30, lineHeight: 1, cursor: "pointer", boxShadow: "0 4px 12px rgba(47,111,94,0.4)" }}>＋</button>
        </div>
        <NavBtn active={tab === "expenses"} onClick={() => setTab("expenses")} icon="🧾" label="הוצאות" />
        <NavBtn active={["more", "fixed", "budget", "advice"].includes(tab)} onClick={() => setTab("more")} icon="☰" label="עוד" />
      </div>

      {(showAddExpense || editExpense) && (
        <ExpenseModal categories={activeCategories.length ? activeCategories : data.categories} user={user} initial={editExpense}
          onClose={() => { setShowAddExpense(false); setEditExpense(null); }} onSave={saveExpense}
          onDelete={async (id) => { if (await deleteExpense(id)) setEditExpense(null); }} />
      )}
      {pendingRestore && (
        <div role="dialog" aria-label="אישור שחזור" style={{ position: "fixed", inset: 0, background: "rgba(20,33,61,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}>
          <div style={{ background: COLORS.card, borderRadius: 16, padding: 20, maxWidth: 340, width: "100%" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>לשחזר מהגיבוי?</div>
            <div style={{ fontSize: 13.5, color: COLORS.sub, marginBottom: 16 }}>כל הנתונים הנוכחיים יוחלפו. בקובץ: {pendingRestore.expenses.length} הוצאות, {pendingRestore.fixedExpenses.length} הוצאות קבועות.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={confirmRestore} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: COLORS.sage, color: "#fff", fontWeight: 800 }}>שחזור</button>
              <button onClick={() => setPendingRestore(null)} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${COLORS.mist}`, background: "none", fontWeight: 700 }}>ביטול</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: COLORS.ink, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, zIndex: 50 }}>{toast}</div>}
    </div>
  );
}

async function downloadBackup() {
  const res = await fetch("/api/export", { credentials: "same-origin" });
  if (!res.ok) { alert("הורדת הגיבוי נכשלה"); return; }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "family-budget-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function MoreMenu({ onPick, onRestore, onLogout }) {
  const items = [
    { id: "fixed", icon: "📌", label: "הוצאות קבועות", sub: "סכומים, כרטיסים, תוקף ושינוי סכום" },
    { id: "budget", icon: "💰", label: "תקציב", sub: "תקציב לכל קטגוריה וחלוקת מזומן/אשראי" },
    { id: "advice", icon: "💬", label: "ייעוץ", sub: "חוות דעת וניתוחים קודמים" },
  ];
  return (
    <div style={{ background: COLORS.card, borderRadius: 16, overflow: "hidden" }}>
      {items.map((it, i) => (
        <button key={it.id} onClick={() => onPick(it.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: "none", borderTop: i ? `1px solid ${COLORS.mist}` : "none", background: "none", cursor: "pointer", textAlign: "start", color: COLORS.ink }}>
          <span style={{ fontSize: 22 }}>{it.icon}</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>{it.label}</span>
            <span style={{ display: "block", fontSize: 12, color: COLORS.sub, marginTop: 2 }}>{it.sub}</span>
          </span>
          <span style={{ color: COLORS.sub }}>‹</span>
        </button>
      ))}
      <button onClick={downloadBackup} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: "none", borderTop: `1px solid ${COLORS.mist}`, background: "none", cursor: "pointer", textAlign: "right", font: "inherit", color: "inherit" }}>
        <span style={{ fontSize: 22 }}>⬇️</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>הורדת גיבוי</span>
          <span style={{ display: "block", fontSize: 12, color: COLORS.sub, marginTop: 2 }}>קובץ עם כל הנתונים, מומלץ פעם בחודש</span>
        </span>
      </button>
      <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: `1px solid ${COLORS.mist}`, cursor: "pointer" }}>
        <span style={{ fontSize: 22 }}>⬆️</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>שחזור מגיבוי</span>
          <span style={{ display: "block", fontSize: 12, color: COLORS.sub, marginTop: 2 }}>מחליף את כל הנתונים הנוכחיים בקובץ גיבוי</span>
        </span>
        <input type="file" accept="application/json,.json" aria-label="קובץ גיבוי" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) onRestore(f); }} />
      </label>
      <button onClick={onLogout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: "none", borderTop: `1px solid ${COLORS.mist}`, background: "none", cursor: "pointer", textAlign: "right", font: "inherit", color: "inherit" }}>
        <span style={{ fontSize: 22 }}>🚪</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>יציאה</span>
          <span style={{ display: "block", fontSize: 12, color: COLORS.sub, marginTop: 2 }}>נעילת האתר במכשיר זה; הכניסה מחדש עם הקוד המשפחתי</span>
        </span>
      </button>
    </div>
  );
}
const navBtnStyle = { width: 34, height: 34, borderRadius: 999, border: "none", background: COLORS.card, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.ink, fontSize: 18 };
function NavBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{ flex: 1, border: "none", background: "none", padding: "10px 0 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: active ? COLORS.sage : COLORS.sub }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: active ? 700 : 500 }}>{label}</span>
    </button>
  );
}

/* ================= DASHBOARD ================= */
/* ================= ALERTS SUMMARY ================= */
const ALERT_STYLE = {
  over: { bg: COLORS.coralLight, fg: COLORS.coral, icon: "●", label: (n) => n === 1 ? "חריגה אחת" : `${n} חריגות` },
  pace: { bg: COLORS.amberLight, fg: "#8a6400", icon: "◔", label: () => "קצב גבוה" },
  near: { bg: COLORS.amberLight, fg: "#8a6400", icon: "●", label: (n) => n === 1 ? "קטגוריה מתקרבת" : `${n} מתקרבות` },
  full: { bg: COLORS.sageLight, fg: COLORS.sage, icon: "✓", label: (n) => n === 1 ? "נוצל במלואו" : `${n} נוצלו במלואם` },
};
function AlertsSummary({ alerts }) {
  const [open, setOpen] = useState(false);
  if (!alerts.length) return null;
  const counts = {}; alerts.forEach(a => { counts[a.kind] = (counts[a.kind] || 0) + 1; });
  const kinds = ["over", "pace", "near", "full"].filter(k => counts[k]);
  return (
    <div style={{ marginBottom: 14, background: COLORS.card, borderRadius: 14, boxShadow: "0 2px 10px rgba(20,33,61,0.04)", overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "none", background: "none", cursor: "pointer", minHeight: 44, textAlign: "start", color: COLORS.ink
      }}>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1, minWidth: 0 }}>
          {kinds.map(k => (
            <span key={k} style={{ background: ALERT_STYLE[k].bg, color: ALERT_STYLE[k].fg, borderRadius: 999, padding: "4px 10px", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
              {ALERT_STYLE[k].icon} {ALERT_STYLE[k].label(counts[k])}
            </span>
          ))}
        </span>
        <span style={{ fontSize: 12, color: COLORS.sub, whiteSpace: "nowrap" }}>{open ? "הסתר פירוט ▴" : "הצג פירוט ▾"}</span>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 12px 12px" }}>
          {alerts.map(a => (
            <div key={a.kind + a.key} style={{ padding: "9px 12px", borderRadius: 10, background: ALERT_STYLE[a.kind].bg, color: ALERT_STYLE[a.kind].fg, fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{a.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function AttentionList({ alerts }) {
  const [more, setMore] = useState(false);
  if (!alerts.length) return null;
  const urgent = alerts.filter(a => a.kind === "over" || a.kind === "pace");
  const rest = alerts.filter(a => !(a.kind === "over" || a.kind === "pace"));
  const rowFor = (a) => (
    <div key={a.kind + a.key} style={{ padding: "9px 12px", borderRadius: 10, background: ALERT_STYLE[a.kind].bg, color: ALERT_STYLE[a.kind].fg, fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{a.text}</div>
  );
  const counts = {}; rest.forEach(a => { counts[a.kind] = (counts[a.kind] || 0) + 1; });
  const restLabel = ["near", "full"].filter(k => counts[k]).map(k => ALERT_STYLE[k].label(counts[k])).join(" · ");
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 14, margin: "2px 2px 8px", color: COLORS.sub }}>דורש תשומת לב</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {urgent.length === 0 && <div style={{ padding: "9px 12px", borderRadius: 10, background: COLORS.sageLight, color: COLORS.sage, fontSize: 13, fontWeight: 600 }}>אין חריגות</div>}
        {urgent.map(rowFor)}
        {rest.length > 0 && (
          <button onClick={() => setMore(m => !m)} aria-expanded={more} style={{ border: "none", background: COLORS.card, borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", cursor: "pointer", fontSize: 12.5, color: COLORS.sub, minHeight: 44 }}>
            <span>{restLabel}</span><span>{more ? "הסתר ▴" : "הצג ▾"}</span>
          </button>
        )}
        {more && rest.map(rowFor)}
      </div>
    </div>
  );
}
// רצועת "מצב הנתונים" - תצוגה בלבד: מבחינה בין נתון מאומת, חלקי והערכה. לא משנה שום חישוב.
function DataStatusStrip({ settings, fixedExpenses, realNowKey }) {
  const rows = [];
  const ob = Number(settings && settings.openingBalance) || 0;
  const obDate = (settings && settings.openingBalanceDate) || "";
  if (ob !== 0 || obDate) {
    rows.push({ key: "ob", label: "יתרת פתיחה לתחזית", value: fmt(ob),
      tag: obDate ? { text: `מעוגנת ל־${obDate.split("-").reverse().join(".")}`, tone: "ok" } : { text: "לא מאומתת · חסר תאריך", tone: "warn" } });
  }
  const nextK = shiftMonthKey(realNowKey, 1);
  const nextOvr = settings && settings.variableOverrides ? settings.variableOverrides[nextK] : undefined;
  if (nextOvr !== undefined && nextOvr !== null) {
    const st = settings && settings.variableOverrideMeta && settings.variableOverrideMeta[nextK] ? settings.variableOverrideMeta[nextK].status : "";
    const nextName = HEBREW_MONTHS[Number(nextK.split("-")[1]) - 1];
    rows.push({ key: "bill", label: `חיוב אשראי ל${nextName}`, value: fmt(nextOvr),
      tag: st === "partial" ? { text: "חלקי", tone: "warn" } : st === "final" ? { text: "סופי", tone: "ok" } : { text: "טרם סומן חלקי/סופי", tone: "warn" } });
  }
  const est = (fixedExpenses || []).filter(f => f.active !== false && isFixedInPeriod(f, realNowKey) && /הערכה|ממוצע/.test(f.name || ""));
  if (est.length) {
    const names = est.map(f => String(f.name).replace(/\s*\((הערכה|ממוצע)\)\s*/g, "").trim());
    const sameFreq = est.every(f => (f.frequencyMonths || 1) === (est[0].frequencyMonths || 1));
    const label = names.join(", ") + (sameFreq && (est[0].frequencyMonths || 1) > 1 ? ` · ${fixedFreqLabel(est[0].frequencyMonths)}` : "");
    rows.push({ key: "est", label, value: est.map(f => fmt(f.amount).replace(" ₪", "")).join(" + ") + " ₪", tag: { text: "הערכה", tone: "warn" } });
  }
  if (!rows.length) return null;
  const tones = { warn: { bg: COLORS.amberLight, fg: "#8a6400", bar: COLORS.amber }, ok: { bg: COLORS.sageLight, fg: COLORS.sage, bar: COLORS.sage } };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 14, margin: "2px 2px 8px", color: COLORS.sub }}>מצב הנתונים</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(r => { const t = tones[r.tag.tone]; return (
          <div key={r.key} style={{ background: COLORS.card, borderRadius: 10, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderInlineStart: `4px solid ${t.bar}`, fontSize: 13, boxShadow: "0 1px 4px rgba(20,33,61,0.04)" }}>
            <span style={{ color: COLORS.ink, minWidth: 0 }}>{r.label} <span style={{ fontSize: 10.5, fontWeight: 700, color: t.fg, background: t.bg, borderRadius: 6, padding: "1px 6px", whiteSpace: "nowrap" }}>{r.tag.text}</span></span>
            <span style={{ fontWeight: 700, color: COLORS.ink, whiteSpace: "nowrap" }}>{r.value}</span>
          </div> ); })}
      </div>
    </div>
  );
}

function Dashboard({ totalBudget, totalSpent, remaining, overallPct, daysLeft, isCurrentMonth, projected, paceHigh, perCategory, alerts, expenses, categories, dim, onEditExpense, onDeleteExpense, onShowAllExpenses, budgetSourceLabel, allExpenses, settings, fixedExpenses, realNowKey }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const gaugeColor = statusColor(overallPct);
  const recent = [...expenses].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 3);
  const barData = perCategory.filter(c => c.budget > 0 || c.spent > 0).map(c => ({ name: c.name, budget: c.budget, spent: c.spent }));
  const pieData = perCategory.filter(c => c.spent > 0).map(c => ({ name: c.name, value: c.spent }));

  const cumulative = useMemo(() => {
    const byDay = {};
    expenses.forEach(e => { const day = Number(e.date?.split("-")[2]); if (day) byDay[day] = (byDay[day] || 0) + Number(e.amount || 0); });
    let running = 0; const arr = [];
    const lastDay = isCurrentMonth ? new Date().getDate() : dim;
    for (let d = 1; d <= lastDay; d++) { running += byDay[d] || 0; arr.push({ day: d, spent: running }); }
    return arr;
  }, [expenses, dim, isCurrentMonth]);

  return (
    <div>
      <div style={{ background: COLORS.card, borderRadius: 20, padding: 20, boxShadow: "0 4px 20px rgba(20,33,61,0.05)", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <RingGauge percent={overallPct} color={gaugeColor} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 800, fontSize: 22 }}>{Math.round(overallPct)}%</div>
              <div style={{ fontSize: 10, color: COLORS.sub }}>נוצל</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <Row label="תקציב משתנה כולל" value={fmt(totalBudget)} />
            <Row label="הוצאות בפועל" value={fmt(totalSpent)} />
            <Row label="נשאר לתקציב" value={fmt(remaining)} bold color={remaining < 0 ? COLORS.coral : COLORS.sage} />
          </div>
        </div>
        {budgetSourceLabel && totalBudget > 0 && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: COLORS.sub, lineHeight: 1.5 }}>התקציב נמשך אוטומטית מ{budgetSourceLabel}. שינוי ערך במסך התקציב יחול על החודש המוצג בלבד.</div>
        )}
        {isCurrentMonth && (() => {
          let latest = "";
          (allExpenses || []).forEach(e => { if (e.date && e.date > latest) latest = e.date; });
          if (!latest) return null;
          const parts = latest.split("-");
          const stale = Math.floor((new Date(todayISO()) - new Date(latest)) / 86400000) >= 3;
          return (
            <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5, background: stale ? COLORS.amberLight : COLORS.paper, border: `1px solid ${stale ? COLORS.amber : COLORS.mist}`, color: stale ? "#8a6400" : COLORS.sub }}>
              תאריך ההוצאה האחרונה ברשימה: <b>{`${Number(parts[2])}.${Number(parts[1])}`}</b>{stale ? " · ייתכן שיש הוצאות נוספות שטרם נרשמו" : ""}
            </div>
          );
        })()}
        {isCurrentMonth && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.mist}`, display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.sub }}>
            <span>{daysLeft} ימים נותרו החודש</span>
            {totalBudget > 0 && <span style={{ display: "flex", alignItems: "center", gap: 4, color: paceHigh ? COLORS.coral : COLORS.sage, fontWeight: 600 }}>{paceHigh ? "↑ קצב גבוה" : "↓ בקצב טוב"}</span>}
          </div>
        )}
        {isCurrentMonth && totalBudget > 0 && (
          <div style={{ marginTop: 6, fontSize: 12.5, color: COLORS.sub }}>אם תמשיך בקצב הנוכחי, צפוי שתסיים את החודש ב־<b style={{ color: COLORS.ink }}>{fmt(projected)}</b></div>
        )}
      </div>

      <DataStatusStrip settings={settings} fixedExpenses={fixedExpenses} realNowKey={realNowKey} />

      <AttentionList alerts={alerts} />

      <button onClick={() => setDetailOpen(o => !o)} aria-expanded={detailOpen} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: COLORS.card, border: "none", borderRadius: 14, padding: "13px 14px", marginBottom: 14, cursor: "pointer", fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 14.5, color: COLORS.ink, minHeight: 44 }}>
        <span>פירוט לפי קטגוריה וגרפים</span><span style={{ fontSize: 12, color: COLORS.sub }}>{detailOpen ? "הסתר ▴" : "הצג ▾"}</span>
      </button>
      {detailOpen && <div>
      <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 15, margin: "6px 2px 8px" }}>קטגוריות</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {perCategory.map(c => (
          <div key={c.id} style={{ background: COLORS.card, borderRadius: 16, padding: 13, boxShadow: "0 2px 10px rgba(20,33,61,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 17 }}>{c.icon}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            </div>
            <ProgressBar percent={c.percent} color={statusColor(c.percent)} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 11.5, color: COLORS.sub }}>
              <span>{fmt(c.spent)}</span><span>{fmt(c.budget)}</span>
            </div>
            {(() => {
              const st = categoryBudgetState(c.budget, c.spent);
              if (st.state === "over") return <div style={{ marginTop: 5, fontSize: 11, fontWeight: 700, color: COLORS.coral }}>חריגה של {fmtAgorot(st.diffAg)}</div>;
              if (st.state === "full") return <div style={{ marginTop: 5, fontSize: 11, fontWeight: 700, color: COLORS.sage }}>התקציב נוצל במלואו</div>;
              return <div style={{ marginTop: 5, fontSize: 11, color: COLORS.sub }}>נשאר {fmt(c.remaining)}</div>;
            })()}
          </div>
        ))}
      </div>

      {barData.length > 0 && <ChartCard title="תקציב מול ביצוע"><BudgetVsActualChart data={barData} /></ChartCard>}
      {pieData.length > 0 && <ChartCard title="התפלגות הוצאות"><DonutChart data={pieData} /></ChartCard>}
      {cumulative.length > 1 && <ChartCard title="הוצאות מצטברות במהלך החודש"><CumulativeLineChart points={cumulative} budget={totalBudget} /></ChartCard>}
      </div>}

      <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 15, margin: "6px 2px 8px" }}>הוצאות אחרונות</div>
      <div style={{ background: COLORS.card, borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
        {recent.length === 0 && <div style={{ padding: 16, fontSize: 13, color: COLORS.sub, textAlign: "center" }}>עדיין אין הוצאות החודש</div>}
        {recent.map((e, i) => <ExpenseRow key={e.id} exp={e} categories={categories} last={i === recent.length - 1} onEdit={onEditExpense} onDelete={onDeleteExpense} />)}
      </div>
      <button onClick={onShowAllExpenses} style={{ width: "100%", border: "none", background: "none", color: COLORS.sage, fontWeight: 700, fontSize: 14, cursor: "pointer", padding: "0 0 20px", minHeight: 44 }}>כל ההוצאות ‹</button>
    </div>
  );
}
function Row({ label, value, bold, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13.5 }}>
      <span style={{ color: COLORS.sub }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: color || COLORS.ink, fontFamily: bold ? "Heebo, sans-serif" : "Assistant, sans-serif" }}>{value}</span>
    </div>
  );
}
function ChartCard({ title, children }) {
  return (
    <div style={{ background: COLORS.card, borderRadius: 16, padding: "14px 12px", marginBottom: 14, boxShadow: "0 2px 10px rgba(20,33,61,0.04)" }}>
      <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function categoryOf(categories, id) { return categories.find(c => c.id === id) || { name: "לא ידוע", icon: "❓" }; }
function ExpenseRow({ exp, categories, last, onEdit, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const cat = categoryOf(categories, exp.categoryId);
  const d = exp.date ? exp.date.split("-").reverse().join("/") : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: last ? "none" : `1px solid ${COLORS.mist}` }}>
      <div style={{ fontSize: 19 }}>{cat.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exp.description || cat.name}</div>
        <div style={{ fontSize: 11.5, color: COLORS.sub }}>{cat.name} · {d} · {exp.user}</div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>{fmt(exp.amount)}</div>
      {!confirmDel ? (
        <div style={{ display: "flex", gap: 2 }}>
          <button onClick={() => onEdit(exp)} style={iconBtnStyle}>✎</button>
          <button onClick={() => setConfirmDel(true)} style={{ ...iconBtnStyle, color: COLORS.coral }}>🗑</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => { onDelete(exp.id); setConfirmDel(false); }} style={{ ...iconBtnStyle, background: COLORS.coral, color: "#fff" }}>✓</button>
          <button onClick={() => setConfirmDel(false)} style={iconBtnStyle}>✕</button>
        </div>
      )}
    </div>
  );
}
const iconBtnStyle = { width: 28, height: 28, borderRadius: 8, border: "none", background: COLORS.paper, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13 };

/* ================= EXPENSES TAB ================= */
function ExpensesTab({ expenses, categories, selectedMonth, onEdit }) {
  const [filterCat, setFilterCat] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const monthEntries = useMemo(() => expenses.filter(e => (e.date || "").startsWith(selectedMonth + "-")), [expenses, selectedMonth]);
  const users = useMemo(() => [...new Set(monthEntries.map(e => e.user).filter(Boolean))], [monthEntries]);
  const filtered = useMemo(() => monthEntries
    .filter(e => !filterCat || e.categoryId === filterCat)
    .filter(e => !filterUser || e.user === filterUser)
    .filter(e => !q.trim() || (e.description || "").toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0)),
    [monthEntries, filterCat, filterUser, q]);
  const total = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
  const days = useMemo(() => {
    const grouped = new Map();
    filtered.forEach(e => { if (!grouped.has(e.date)) grouped.set(e.date, []); grouped.get(e.date).push(e); });
    return [...grouped.entries()];
  }, [filtered]);
  const filterCount = Number(!!filterCat) + Number(!!filterUser);
  const isFiltered = !!(filterCat || filterUser || q.trim());
  const clear = () => { setFilterCat(""); setFilterUser(""); setQ(""); };
  const control = { minHeight: 44, fontSize: 14, borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "#fff", color: COLORS.ink, fontFamily: "inherit", padding: "10px 12px" };
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "Heebo, sans-serif", fontSize: 21, margin: "2px 2px 12px" }}>הוצאות</h1>
      <div style={{ background: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: COLORS.sub }}>{isFiltered ? "נרשם בחודש זה · לפי הסינון" : "נרשם בחודש זה"}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginTop: 4 }}>
          <strong data-testid="expenses-total" style={{ fontSize: 28, fontFamily: "Heebo, sans-serif" }}>{fmt(total)}</strong>
          <span data-testid="expenses-count" style={{ fontSize: 14, color: COLORS.sub }}>{filtered.length} הוצאות</span>
        </div>
        <div style={{ fontSize: 12, color: COLORS.sub, borderTop: `1px solid ${COLORS.mist}`, paddingTop: 10, marginTop: 10 }}>רק הוצאות מ{monthLabelOf(selectedMonth)} · לפי תאריך ההוצאה</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input aria-label="חיפוש בחודש הזה" placeholder="חיפוש בחודש הזה…" value={q} onChange={e => setQ(e.target.value)} style={{ ...control, minWidth: 0, flex: 1 }} />
        <button aria-expanded={showFilters} aria-controls="expense-filters" onClick={() => setShowFilters(v => !v)} style={{ ...control, fontWeight: 600, flexShrink: 0 }}>סינון{filterCount ? ` (${filterCount})` : ""} {showFilters ? "▴" : "▾"}</button>
      </div>
      {showFilters && <div id="expense-filters" style={{ background: COLORS.card, borderRadius: 14, padding: 12, marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 10 }}>
        <label style={{ flex: "1 1 130px", fontSize: 12, color: COLORS.sub }}>קטגוריה
          <select aria-label="סינון לפי קטגוריה" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...control, width: "100%", marginTop: 4 }}>
            <option value="">כל הקטגוריות</option>{categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </label>
        <label style={{ flex: "1 1 130px", fontSize: 12, color: COLORS.sub }}>מי ביצע
          <select aria-label="סינון לפי משתמש" value={filterUser} onChange={e => setFilterUser(e.target.value)} style={{ ...control, width: "100%", marginTop: 4 }}>
            <option value="">כל המשתמשים</option>{users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>}
      {isFiltered && <button onClick={clear} style={{ ...control, background: "none", border: "none", color: COLORS.sage, fontWeight: 700 }}>ניקוי החיפוש והסינון</button>}
      {filtered.length === 0 && <div style={{ padding: "28px 16px", textAlign: "center", color: COLORS.sub, background: COLORS.card, borderRadius: 16 }}>{monthEntries.length === 0 ? "אין עדיין הוצאות בחודש הזה" : "לא נמצאו הוצאות לפי הסינון"}</div>}
      {days.map(([date, entries]) => <section key={date} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "space-between", padding: "10px 4px 8px", fontSize: 13, color: COLORS.sub }}>
          <strong>{`${Number(date.slice(8, 10))} ב${HEBREW_MONTHS[Number(date.slice(5, 7)) - 1]}`}</strong>
          <span>{entries.length === 1 ? "הוצאה אחת" : `${entries.length} הוצאות`} · {fmt(entries.reduce((s, e) => s + Number(e.amount || 0), 0))}</span>
        </div>
        <div style={{ background: COLORS.card, borderRadius: 16, overflow: "hidden" }}>
          {entries.map((e, i) => { const cat = categoryOf(categories, e.categoryId); return <button key={e.id} data-expense-id={e.id} onClick={() => onEdit(e)} aria-label={`עריכת ${e.description || cat.name}, ${fmt(e.amount)}`} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 68, padding: "12px 14px", textAlign: "right", color: COLORS.ink, background: "none", border: "none", borderBottom: i === entries.length - 1 ? "none" : `1px solid ${COLORS.mist}`, fontFamily: "inherit", cursor: "pointer" }}>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700, overflowWrap: "anywhere" }}>{e.description || cat.name}</div><div style={{ color: COLORS.sub, fontSize: 12.5, marginTop: 4 }}>{cat.name} · {e.user}</div></div>
            <strong style={{ fontSize: 16, whiteSpace: "nowrap" }}>{fmt(e.amount)}</strong><span aria-hidden="true" style={{ color: COLORS.sub, fontSize: 20 }}>‹</span>
          </button>; })}
        </div>
      </section>)}
    </div>
  );
}
const selectStyle = { padding: "8px 10px", borderRadius: 10, border: `1px solid ${COLORS.mist}`, fontSize: 12.5, background: "#fff", flex: 1, minWidth: 110 };

/* ================= FIXED EXPENSE PERIODS ================= */
function monthLabelOf(k) { const m = /^(\d{4})-(\d{2})$/.exec(k || ""); return m ? `${HEBREW_MONTHS[Number(m[2]) - 1]} ${m[1]}` : ""; }
function MonthPicker({ value, onChange, allowEmpty, label }) {
  const nowY = new Date().getFullYear();
  const [y, m] = MONTH_RE.test(value || "") ? value.split("-") : ["", ""];
  const years = []; for (let i = nowY - 2; i <= nowY + 14; i++) years.push(String(i));
  if (y && !years.includes(y)) years.push(y);
  const set = (ny, nm) => { if (!ny && !nm) return onChange(""); onChange(`${ny || String(nowY)}-${nm || "01"}`); };
  const sel = { height: 40, borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "#fff", fontSize: 16, fontFamily: "inherit", minWidth: 0, flex: 1, padding: "0 6px" };
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", gap: 6 }}>
        <select aria-label={label + " - חודש"} value={m} onChange={e => set(y, e.target.value)} style={sel}>
          {allowEmpty && <option value="">ללא הגבלה</option>}
          {HEBREW_MONTHS.map((n, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{n}</option>)}
        </select>
        <select aria-label={label + " - שנה"} value={y} onChange={e => set(e.target.value, m)} style={{ ...sel, flex: "0 0 86px" }} disabled={allowEmpty && !m}>
          {allowEmpty && !y && <option value=""></option>}
          {years.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    </div>
  );
}
function FixedPeriodPanel({ f, mKey, siblings, onUpdate, onSplit, onClose }) {
  const [from, setFrom] = useState(f.effectiveFrom || "");
  const [to, setTo] = useState(f.effectiveTo || "");
  const [err, setErr] = useState("");
  const [chgMonth, setChgMonth] = useState(MONTH_RE.test(f.effectiveFrom || "") && mKey <= f.effectiveFrom ? "" : mKey);
  const [chgAmount, setChgAmount] = useState("");
  const [err2, setErr2] = useState("");
  const chgErr = chgMonth && chgAmount !== "" ? validateAmountChange(f, chgMonth, chgAmount) : "";
  const box = { background: COLORS.paper, borderRadius: 12, padding: 12, marginTop: 8 };
  const btn = (primary) => ({ flex: 1, minHeight: 42, borderRadius: 10, border: primary ? "none" : `1px solid ${COLORS.mist}`, background: primary ? COLORS.sage : "#fff", color: primary ? "#fff" : COLORS.ink, fontWeight: 700, fontSize: 13.5, cursor: "pointer" });
  const savePeriod = () => {
    const e = validateFixedPeriod(from, to, siblings);
    if (e) return setErr(e);
    setErr(""); onUpdate(f.id, { effectiveFrom: from || null, effectiveTo: to || null }); onClose();
  };
  const applyChange = () => {
    const e = validateAmountChange(f, chgMonth, chgAmount);
    if (e) return setErr2(e);
    onSplit(f.id, chgMonth, Number(chgAmount)); onClose();
  };
  return (
    <div className="fx-panel" style={{ gridColumn: "1 / -1", minWidth: 0 }}>
      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>תקופת תוקף</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
          <MonthPicker label="החל מחודש" value={from} onChange={setFrom} allowEmpty />
          <MonthPicker label="עד חודש" value={to} onChange={setTo} allowEmpty />
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.sub, marginTop: 6 }}>החודשים כלולים בתקופה. "ללא הגבלה" = בלי גבול בצד הזה. היסטוריה לא נמחקת, והתדירות וחודש העוגן ({fixedFreqLabel(f.frequencyMonths)}) לא משתנים.</div>
        {err && <div role="alert" style={{ color: COLORS.coral, fontSize: 12.5, fontWeight: 600, marginTop: 6 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={onClose} style={btn(false)}>סגירה</button>
          <button onClick={savePeriod} style={btn(true)}>שמירת תוקף</button>
        </div>
      </div>
      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>שינוי סכום החל מחודש</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
          <MonthPicker label="החל מחודש" value={chgMonth} onChange={setChgMonth} />
          <div>
            <label style={labelStyle}>סכום חדש (₪)</label>
            <input type="number" inputMode="decimal" value={chgAmount} onChange={e => setChgAmount(e.target.value)} placeholder={String(f.amount)}
              style={{ ...inputStyle, height: 40, fontSize: 16 }} />
          </div>
        </div>
        {chgMonth && chgAmount !== "" && !chgErr && (
          <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.5, background: COLORS.sageLight, borderRadius: 10, padding: "8px 10px" }}>
            הסכום הנוכחי {fmt(f.amount)} יישמר עד {monthLabelOf(prevMonthKey(chgMonth))}, והסכום החדש {fmt(chgAmount)} יחול מ־{monthLabelOf(chgMonth)}. חודשים קודמים לא ישתנו.
          </div>
        )}
        {(chgErr || err2) && <div role="alert" style={{ color: COLORS.coral, fontSize: 12.5, fontWeight: 600, marginTop: 6 }}>{chgErr || err2}</div>}
        <button onClick={applyChange} disabled={!chgMonth || chgAmount === "" || !!chgErr} style={{ ...btn(true), width: "100%", marginTop: 10, opacity: (!chgMonth || chgAmount === "" || chgErr) ? 0.5 : 1 }}>
          {chgMonth ? `אישור: החל מ־${monthLabelOf(chgMonth)}` : "בחר חודש"}
        </button>
      </div>
    </div>
  );
}

/* ================= FIXED EXPENSES TAB ================= */
function FixedExpensesTab({ fixedExpenses, onAdd, onUpdate, onRemove, onSplit, cards, plannedExpenses, onAddPlanned, onRemovePlanned, monthDate }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("1");
  const [freq, setFreq] = useState("1");
  const mKey = monthKey(monthDate);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [fromM, setFromM] = useState("");
  const [toM, setToM] = useState("");
  const [addErr, setAddErr] = useState("");
  const [showEnded, setShowEnded] = useState(false);
  const [addCredit, setAddCredit] = useState(false);
  const [addCard, setAddCard] = useState("");
  const byDay = (a, b) => (a.dueDay || 1) - (b.dueDay || 1) || String(a.effectiveFrom || "").localeCompare(String(b.effectiveFrom || ""));
  const allActive = fixedExpenses.filter(f => f.active !== false);
  // הוצאות שהסתיימו לפני החודש הנבחר מוצגות בנפרד (ההיסטוריה נשמרת); כל השאר בדיוק כמו קודם
  const ended = allActive.filter(f => MONTH_RE.test(f.effectiveTo || "") && f.effectiveTo < mKey).sort(byDay);
  const active = allActive.filter(f => !ended.includes(f)).sort(byDay);
  const total = fixedTotalForMonth(fixedExpenses, mKey);

  const reset = () => { setName(""); setAmount(""); setDueDay("1"); setFreq("1"); setFromM(""); setToM(""); setAddErr(""); setAddCredit(false); setAddCard(""); setAdding(false); };

  const [addingPlanned, setAddingPlanned] = useState(false);
  const [pName, setPName] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pDate, setPDate] = useState(todayISO());
  const plannedDateOk = (p) => typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date);
  const upcomingPlanned = plannedExpenses.filter(p => plannedDateOk(p) && p.date >= mKey + "-01").sort((a, b) => a.date.localeCompare(b.date));
  // מתוכננות שעברו (או בלי תאריך תקין) נשמרות גלויות וניתנות למחיקה, במקום להיעלם מהממשק
  const pastPlanned = plannedExpenses.filter(p => !plannedDateOk(p) || p.date < mKey + "-01").sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const [showPastPlanned, setShowPastPlanned] = useState(false);
  const resetPlanned = () => { setPName(""); setPAmount(""); setPDate(todayISO()); setAddingPlanned(false); };

  const renderFixedFull = (f, i, list) => (
          <div key={f.id} className="fx-card" style={{ borderBottom: i === list.length - 1 ? "none" : `1px solid ${COLORS.mist}` }}>
            <div className="fx-main">
              <div style={{
                width: 34, height: 34, borderRadius: 10, background: COLORS.sageLight, color: COLORS.sage,
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12.5, flexShrink: 0
              }}>{f.dueDay}</div>
              <div className="fx-text">
                <textarea className="fx-name" rows={1} defaultValue={f.name} aria-label="שם ההוצאה"
                  ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
                  onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } }}
                  onBlur={(e) => onUpdate(f.id, { name: e.target.value || f.name })} />
                <div className="fx-sub">
                  חיוב בכל {f.dueDay} לחודש · {fixedFreqLabel(f.frequencyMonths)} · {!f.onCredit ? "חיוב ישיר" : !f.cardId ? "באשראי (חודש הבא)" : `באשראי · ${(cards.find(c => c.id === f.cardId) || {}).name || "כרטיס לא קיים"}`}
                </div>
                {f.onCredit && (
                  <div style={{ marginTop: 4 }}>
                    <select aria-label="כרטיס אשראי" value={f.cardId || ""} onChange={(e) => onUpdate(f.id, { cardId: e.target.value || null })}
                      style={{ width: "100%", maxWidth: 260, height: 38, borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "#fff", fontSize: 14, fontFamily: "inherit", padding: "0 6px" }}>
                      <option value="">הגדרה גלובלית (ללא כרטיס)</option>
                      {cards.map(c => <option key={c.id} value={c.id}>{c.name || "כרטיס ללא שם"}</option>)}
                      {f.cardId && !cards.some(c => c.id === f.cardId) && <option value={f.cardId}>כרטיס לא קיים</option>}
                    </select>
                    {f.cardId && (() => { const c = cards.find(x => x.id === f.cardId); return !isCardComplete(c) ? (
                      <div role="alert" style={{ fontSize: 11.5, color: "#8a6400", background: COLORS.amberLight, borderRadius: 8, padding: "5px 8px", marginTop: 4 }}>
                        ⚠️ {c ? `חסרות הגדרות חיוב לכרטיס (${cardMissingSettings(c)})` : "הכרטיס לא קיים"} — הסכום לא ישובץ בתחזית עד שיוגדרו
                      </div>) : null; })()}
                  </div>
                )}
                {(f.effectiveFrom || f.effectiveTo) && (
                  <div className="fx-sub" style={{ color: COLORS.sage, fontWeight: 600 }}>
                    תוקף: {f.effectiveFrom ? `מ־${monthLabelOf(f.effectiveFrom)}` : "ללא התחלה"}{f.effectiveTo ? ` עד ${monthLabelOf(f.effectiveTo)}` : " ללא הגבלה"}
                  </div>
                )}
                <button onClick={() => setEditingId(editingId === f.id ? null : f.id)} aria-expanded={editingId === f.id}
                  style={{ border: "none", background: "none", color: COLORS.sage, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "6px 0", minHeight: 32, textDecoration: "underline" }}>
                  {editingId === f.id ? "סגירת עריכת תוקף" : "תוקף ושינוי סכום"}
                </button>
                <button onClick={() => { setExpandedId(null); setEditingId(null); }} aria-label="סגירת פרטים"
                  style={{ border: "none", background: "none", color: COLORS.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "6px 12px", minHeight: 32 }}>▴ סגירה</button>
              </div>
            </div>
            <button className="fx-del" onClick={() => { if (window.confirm(`למחוק את ההוצאה הקבועה "${f.name}" (${fmt(f.amount)})?\n\nהיא תיעלם מהתחזית.`)) onRemove(f.id); }} title="מחיקה" aria-label="מחיקה">🗑</button>
            <div className="fx-controls">
              <label className="fx-ctl fx-amount">
                <input type="number" inputMode="decimal" aria-label="סכום" defaultValue={f.amount} onBlur={(e) => onUpdate(f.id, { amount: round2(e.target.value) })} />
                <span>₪</span>
              </label>
              <select className="fx-ctl fx-freq" aria-label="תדירות" value={String(f.frequencyMonths || 1)} onChange={(e) => onUpdate(f.id, { frequencyMonths: Number(e.target.value), anchorMonth: f.anchorMonth || mKey })}>
                <option value="1">חודשי</option>
                <option value="2">דו-חודשי</option>
                <option value="12">שנתי</option>
              </select>
              <button className="fx-ctl fx-credit" onClick={() => onUpdate(f.id, { onCredit: !f.onCredit })} title="חיוב באשראי" aria-pressed={!!f.onCredit}
                style={{ borderColor: f.onCredit ? COLORS.sage : COLORS.mist, background: f.onCredit ? COLORS.sageLight : "#fff" }}>
                💳 {f.onCredit ? "אשראי" : "ישיר"}
              </button>
            </div>
            {editingId === f.id && (
              <FixedPeriodPanel f={f} mKey={mKey} siblings={f.seriesId ? fixedExpenses.filter(x => x.seriesId === f.seriesId && x.id !== f.id && x.active !== false) : []}
                onUpdate={onUpdate} onSplit={onSplit} onClose={() => setEditingId(null)} />
            )}
          </div>
  );

  const renderFixedRow = (f, i, list) => {
    if (expandedId === f.id) return renderFixedFull(f, i, list);
    const card = f.cardId ? cards.find(x => x.id === f.cardId) : null;
    const warn = f.onCredit && f.cardId && !isCardComplete(card);
    return (
      <button key={f.id} className="fx-compact" onClick={() => setExpandedId(f.id)} aria-expanded="false"
        style={{ borderBottom: i === list.length - 1 ? "none" : `1px solid ${COLORS.mist}` }}>
        <span className="fx-day">{f.dueDay}</span>
        <span className="fx-cname">{f.name}{(f.frequencyMonths || 1) > 1 ? <small> · {fixedFreqLabel(f.frequencyMonths)}</small> : null}{(f.effectiveFrom || f.effectiveTo) ? <small> · תוקף מוגבל</small> : null}</span>
        <span className="fx-camt">{warn ? "⚠️ " : ""}{f.onCredit ? "💳 " : ""}{fmt(f.amount)}</span>
        <span className="fx-chev">▾</span>
      </button>
    );
  };

  return (
    <div>
      <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 15, margin: "6px 2px 10px" }}>הוצאות קבועות</div>
      <div style={{ background: COLORS.card, borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
        {active.length === 0 && ended.length === 0 && <div style={{ padding: 18, textAlign: "center", color: COLORS.sub, fontSize: 13 }}>עדיין לא הוגדרו הוצאות קבועות</div>}
        {active.map((f, i) => renderFixedRow(f, i, active))}
      </div>
      {ended.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => setShowEnded(v => !v)} aria-expanded={showEnded} style={{ border: "none", background: "none", fontSize: 13, fontWeight: 700, color: COLORS.sub, cursor: "pointer", minHeight: 40, padding: "0 2px" }}>
            {showEnded ? "▴" : "▾"} הוצאות שהסתיימו לפני {monthLabelOf(mKey)} ({ended.length})
          </button>
          {showEnded && <div style={{ background: COLORS.card, borderRadius: 16, overflow: "hidden", opacity: 0.9 }}>{ended.map((f, i) => renderFixedRow(f, i, ended))}</div>}
        </div>
      )}
      <div style={{ fontSize: 11, color: COLORS.sub, margin: "-8px 2px 12px" }}>💳 = ההוצאה מחויבת באשראי ותשתקף בתחזית בחודש שאחרי, לא בחודש בו היא בוצעה</div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px 14px", fontSize: 13.5 }}>
        <span style={{ color: COLORS.sub }}>סה"כ הוצאות קבועות ב{monthLabelOf(mKey)}</span>
        <span style={{ fontWeight: 800, fontFamily: "Heebo, sans-serif" }}>{fmt(total)}</span>
      </div>

      {!adding ? (
        <button onClick={() => setAdding(true)} style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1.5px dashed ${COLORS.sage}`, background: "none", color: COLORS.sage, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>＋ הוספת הוצאה קבועה</button>
      ) : (
        <div style={{ background: COLORS.card, borderRadius: 16, padding: 14, marginBottom: 8 }}>
          <label style={labelStyle}>שם</label>
          <input placeholder="למשל: משכנתא" value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>סכום</label>
              <input type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ width: 90 }}>
              <label style={labelStyle}>יום חיוב</label>
              <input type="number" min="1" max="31" value={dueDay} onChange={e => setDueDay(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 10 }}>
            <MonthPicker label="החל מחודש (לא חובה)" value={fromM} onChange={setFromM} allowEmpty />
            <MonthPicker label="עד חודש (לא חובה)" value={toM} onChange={setToM} allowEmpty />
          </div>
          <div style={{ marginBottom: 10 }}>
            <button onClick={() => setAddCredit(v => !v)} aria-pressed={addCredit} style={{ minHeight: 40, padding: "0 12px", borderRadius: 10, border: `1.5px solid ${addCredit ? COLORS.sage : COLORS.mist}`, background: addCredit ? COLORS.sageLight : "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>💳 חיוב באשראי {addCredit ? "✓" : ""}</button>
            {addCredit && (
              <select aria-label="כרטיס אשראי" value={addCard} onChange={e => setAddCard(e.target.value)} style={{ ...selectStyle, marginTop: 8, width: "100%", height: 40, fontSize: 16 }}>
                <option value="">הגדרה גלובלית (ללא כרטיס)</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.name || "כרטיס ללא שם"}</option>)}
              </select>
            )}
          </div>
          {addErr && <div role="alert" style={{ color: COLORS.coral, fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{addErr}</div>}
          <label style={labelStyle}>תדירות</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[["1", "חודשי"], ["2", "דו-חודשי (כמו חשמל/מים)"], ["12", "שנתי (כמו ביטוח רכב ורישיון)"]].map(([val, lbl]) => (
              <button key={val} onClick={() => setFreq(val)} style={{
                flex: 1, padding: "9px 6px", borderRadius: 10, border: `1.5px solid ${freq === val ? COLORS.sage : COLORS.mist}`,
                background: freq === val ? COLORS.sageLight : "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer"
              }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "#fff", cursor: "pointer", fontSize: 13 }}>ביטול</button>
            <button disabled={!name.trim() || !Number(amount)} onClick={() => { const dv = Number(dueDay); const dayErr = (!Number.isInteger(dv) || dv < 1 || dv > 31) ? "היום בחודש חייב להיות מספר שלם בין 1 ל־31" : ""; const e = dayErr || validateFixedPeriod(fromM, toM, []); if (e) return setAddErr(e); onAdd(name.trim(), round2(amount), dv, Number(freq), mKey, fromM || null, toM || null, addCredit, addCard || null); reset(); }}
              style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: COLORS.sage, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>שמירה</button>
          </div>
        </div>
      )}

      <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 15, margin: "22px 2px 10px" }}>הוצאות מתוכננות (חד-פעמיות)</div>
      <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 10 }}>הוצאה עתידית בתאריך ידוע — תשתקף בטאב התחזית בחודש הרלוונטי</div>
      <div style={{ background: COLORS.card, borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
        {upcomingPlanned.length === 0 && <div style={{ padding: 18, textAlign: "center", color: COLORS.sub, fontSize: 13 }}>אין הוצאות מתוכננות קרובות</div>}
        {upcomingPlanned.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: i === upcomingPlanned.length - 1 ? "none" : `1px solid ${COLORS.mist}` }}>
            <div style={{ fontSize: 18 }}>📌</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: COLORS.sub }}>{p.date.split("-").reverse().join("/")}</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{fmt(p.amount)}</div>
            <button onClick={() => onRemovePlanned(p.id)} style={{ ...iconBtnStyle, color: COLORS.coral }}>🗑</button>
          </div>
        ))}
      </div>

      {pastPlanned.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => setShowPastPlanned(v => !v)} aria-expanded={showPastPlanned} style={{ border: "none", background: "none", fontSize: 13, fontWeight: 700, color: COLORS.sub, cursor: "pointer", minHeight: 40, padding: "0 2px" }}>
            {showPastPlanned ? "▴" : "▾"} מתוכננות שעברו ({pastPlanned.length})
          </button>
          {showPastPlanned && <div style={{ background: COLORS.card, borderRadius: 16, overflow: "hidden", opacity: 0.9 }}>{pastPlanned.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: i === pastPlanned.length - 1 ? "none" : `1px solid ${COLORS.mist}` }}>
              <div style={{ fontSize: 18 }}>📌</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: COLORS.sub }}>{plannedDateOk(p) ? p.date.split("-").reverse().join("/") : "ללא תאריך"}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{fmt(p.amount)}</div>
              <button onClick={() => onRemovePlanned(p.id)} aria-label={"מחיקת " + (p.name || "הוצאה מתוכננת")} style={{ ...iconBtnStyle, color: COLORS.coral }}>🗑</button>
            </div>
          ))}</div>}
        </div>
      )}

      {!addingPlanned ? (
        <button onClick={() => setAddingPlanned(true)} style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1.5px dashed ${COLORS.sage}`, background: "none", color: COLORS.sage, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>＋ הוספת הוצאה מתוכננת</button>
      ) : (
        <div style={{ background: COLORS.card, borderRadius: 16, padding: 14 }}>
          <label style={labelStyle}>שם</label>
          <input placeholder="למשל: טיסה, תיקון רכב" value={pName} onChange={e => setPName(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>סכום</label>
              <input type="number" placeholder="0" value={pAmount} onChange={e => setPAmount(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>תאריך</label>
              <input type="date" value={pDate} onChange={e => setPDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={resetPlanned} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "#fff", cursor: "pointer", fontSize: 13 }}>ביטול</button>
            <button disabled={!pName.trim() || !Number(pAmount) || !/^\d{4}-\d{2}-\d{2}$/.test(pDate || "")} onClick={() => { onAddPlanned(pName.trim(), Number(pAmount), pDate); resetPlanned(); }}
              style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: COLORS.sage, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>שמירה</button>
          </div>
        </div>
      )}
      <div style={{ height: 80 }} />
    </div>
  );
}

/* ================= RECURRING INCOMES ================= */
function RecurringIncomeForm({ initial, onSubmit, onCancel }) {
  const i = initial || {};
  const [f, setF] = useState({ name: i.name || "", amount: isEmptyVal(i.amount) ? "" : String(i.amount), day: isEmptyVal(i.day) ? "" : String(i.day),
    startMonth: i.startMonth || "", endMonth: i.endMonth || "", bonusAmount: isEmptyVal(i.bonusAmount) ? "" : String(i.bonusAmount),
    bonusEveryMonths: isEmptyVal(i.bonusEveryMonths) ? "" : String(i.bonusEveryMonths), bonusAnchorMonth: i.bonusAnchorMonth || "" });
  const [err, setErr] = useState("");
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  const inp = { ...inputStyle, height: 40, fontSize: 16 };
  const submit = () => {
    const e = validateRecurringIncome(f);
    if (e) return setErr(e);
    const out = { id: i.id || uid(), name: f.name.trim(), amount: Number(f.amount), day: Number(f.day), startMonth: f.startMonth };
    if (!isEmptyVal(f.endMonth)) out.endMonth = f.endMonth;
    if (!isEmptyVal(f.bonusAmount)) { out.bonusAmount = Number(f.bonusAmount); out.bonusEveryMonths = Number(f.bonusEveryMonths); out.bonusAnchorMonth = f.bonusAnchorMonth; }
    onSubmit(out);
  };
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 10 };
  return (
    <div style={{ background: COLORS.paper, borderRadius: 12, padding: 12, marginTop: 8 }}>
      <label style={labelStyle}>שם ההכנסה</label>
      <input aria-label="שם ההכנסה" value={f.name} onChange={e => set("name")(e.target.value)} placeholder="למשל: משכורת" style={inp} />
      <div style={grid}>
        <div><label style={labelStyle}>סכום רגיל (₪)</label><input aria-label="סכום רגיל" type="number" inputMode="decimal" min="0" value={f.amount} onChange={e => set("amount")(e.target.value)} style={inp} /></div>
        <div><label style={labelStyle}>יום בחודש</label><input aria-label="יום בחודש" type="number" inputMode="numeric" min="1" max="31" value={f.day} onChange={e => set("day")(e.target.value)} style={inp} /></div>
      </div>
      <div style={grid}>
        <MonthPicker label="חודש התחלה" value={f.startMonth} onChange={set("startMonth")} allowEmpty />
        <MonthPicker label="חודש סיום (לא חובה)" value={f.endMonth} onChange={set("endMonth")} allowEmpty />
      </div>
      <div style={{ fontWeight: 700, fontSize: 12.5, marginTop: 14 }}>בונוס חוזר (לא חובה, שלושת השדות יחד)</div>
      <div style={grid}>
        <div><label style={labelStyle}>סכום בחודש בונוס (₪)</label><input aria-label="סכום בחודש בונוס" type="number" inputMode="decimal" min="0" value={f.bonusAmount} onChange={e => set("bonusAmount")(e.target.value)} style={inp} /></div>
        <div><label style={labelStyle}>כל כמה חודשים</label><input aria-label="תדירות הבונוס בחודשים" type="number" inputMode="numeric" min="1" value={f.bonusEveryMonths} onChange={e => set("bonusEveryMonths")(e.target.value)} style={inp} /></div>
      </div>
      <div style={{ marginTop: 10 }}><MonthPicker label="חודש עוגן לבונוס" value={f.bonusAnchorMonth} onChange={set("bonusAnchorMonth")} allowEmpty /></div>
      <div style={{ fontSize: 11.5, color: COLORS.sub, marginTop: 6, lineHeight: 1.5 }}>בחודש בונוס הסכום שלו מחליף את הסכום הרגיל (לא מתווסף). חודש העוגן עצמו הוא חודש בונוס, והבונוס חוזר כל N חודשים אחריו ולא לפניו. בחודש קצר ההכנסה נרשמת ביום האחרון.</div>
      {err && <div role="alert" style={{ color: COLORS.coral, fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, minHeight: 42, borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>ביטול</button>
        <button onClick={submit} style={{ flex: 1, minHeight: 42, borderRadius: 10, border: "none", background: COLORS.sage, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>שמירה</button>
      </div>
    </div>
  );
}
function IncomeLinkDialog({ r, incomeEntries, recurringIncomes, onConfirm, onClose }) {
  const [sel, setSel] = useState([]);
  const cands = incomeEntries.filter(e => !e.recurringIncomeId).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const linkedElsewhere = incomeEntries.filter(e => e.recurringIncomeId);
  const err = sel.length ? validateIncomeLink(r.id, sel, incomeEntries) : "";
  const chosen = cands.filter(e => sel.includes(e.id));
  const toggle = (id) => setSel(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  return (
    <div style={{ background: COLORS.paper, borderRadius: 12, padding: 12, marginTop: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>קישור הכנסות קיימות אל "{r.name}"</div>
      <div style={{ fontSize: 11.5, color: COLORS.sub, lineHeight: 1.5, margin: "4px 0 8px" }}>
        הקישור משנה רק את שיוך הרשומה (recurringIncomeId), בלי לשנות סכום, שם, תאריך או חודש. רשומה מקושרת מחליפה את ההכנסה הקבועה בחודש שלה. אפשר לבחור גם רשומות בשמות שונים. שום דבר לא מקושר אוטומטית.
      </div>
      {cands.length === 0 && <div style={{ fontSize: 12.5, color: COLORS.sub }}>אין הכנסות ידניות לא מקושרות</div>}
      <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {cands.map(e => {
          const applies = !!recurringIncomeForMonth(r, e.monthKey);
          return (
            <label key={e.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fff", borderRadius: 10, padding: "8px 10px", minHeight: 44, cursor: "pointer", border: `1.5px solid ${sel.includes(e.id) ? COLORS.sage : COLORS.mist}` }}>
              <input type="checkbox" checked={sel.includes(e.id)} onChange={() => toggle(e.id)} style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflowWrap: "anywhere" }}>
                <b>{monthLabelOf(e.monthKey)}</b> · {e.source} · {fmt(e.amount)}
                {applies && <span style={{ display: "block", fontSize: 11.5, color: "#8a6400" }}>⚠️ ייתכן כפל: ההכנסה הקבועה חלה גם בחודש הזה. אחרי הקישור הרשומה תחליף אותה ולא תיספר פעמיים</span>}
              </span>
            </label>
          );
        })}
      </div>
      {linkedElsewhere.length > 0 && <div style={{ fontSize: 11.5, color: COLORS.sub, marginTop: 6 }}>{linkedElsewhere.length} רשומות כבר מקושרות ואינן מוצגות כאן</div>}
      {chosen.length > 0 && !err && (
        <div style={{ fontSize: 12.5, background: COLORS.sageLight, borderRadius: 10, padding: "8px 10px", marginTop: 8, lineHeight: 1.6 }}>
          תצוגה מקדימה: יקושרו {chosen.length} רשומות ל"{r.name}":
          {chosen.map(e => <div key={e.id}>• {monthLabelOf(e.monthKey)} · {fmt(e.amount)} (במקום הסכום הקבוע של החודש הזה)</div>)}
        </div>
      )}
      {err && <div role="alert" style={{ color: COLORS.coral, fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={onClose} style={{ flex: 1, minHeight: 42, borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>סגירה</button>
        <button disabled={!chosen.length || !!err} onClick={() => { onConfirm(r.id, sel); onClose(); }}
          style={{ flex: 1, minHeight: 42, borderRadius: 10, border: "none", background: COLORS.sage, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", opacity: (!chosen.length || err) ? 0.5 : 1 }}>
          אישור קישור {chosen.length ? `(${chosen.length})` : ""}
        </button>
      </div>
    </div>
  );
}
function RecurringIncomesPanel({ recurringIncomes, incomeEntries, onSave, onLink }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // null | "new" | {edit: id} | {link: id}
  const del = (r) => {
    const linked = incomeEntries.filter(e => e.recurringIncomeId === r.id).length;
    const msg = `למחוק את ההכנסה הקבועה "${r.name}"?\n\nהיא תיעלם מהתחזית בכל החודשים.${linked ? `\n${linked} רשומות ידניות מקושרות אליה לא יימחקו וימשיכו להיספר כהכנסות רגילות בחודשים שלהן.` : ""}`;
    if (window.confirm(msg)) onSave(recurringIncomes.filter(x => x.id !== r.id));
  };
  return (
    <div style={{ background: COLORS.card, borderRadius: 14, padding: "6px 14px", marginBottom: 14 }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", border: "none", background: "none", minHeight: 44, cursor: "pointer", fontSize: 13, fontWeight: 700, color: COLORS.ink, padding: 0 }}>
        <span>💰 הכנסות קבועות ({recurringIncomes.length})</span><span style={{ color: COLORS.sub, fontSize: 12 }}>{open ? "סגירה ▴" : "פתיחה ▾"}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 12 }}>
          <div style={{ fontSize: 11.5, color: COLORS.sub, lineHeight: 1.5, marginBottom: 8 }}>הכנסה קבועה ממלאת את התחזית בכל חודש רלוונטי. כדי לשנות חודש מסוים אפשר ללחוץ "שנה לחודש זה" בתוך החודש בתחזית.</div>
          {recurringIncomes.map(r => {
            const dupes = incomeEntries.filter(e => !e.recurringIncomeId && recurringIncomeForMonth(r, e.monthKey)).length;
            return (
              <div key={r.id} style={{ borderTop: `1px solid ${COLORS.mist}`, padding: "10px 0" }}>
                <div style={{ fontWeight: 700, fontSize: 14, overflowWrap: "anywhere" }}>{r.name} · {fmt(r.amount)}</div>
                <div style={{ fontSize: 12, color: COLORS.sub, lineHeight: 1.5 }}>
                  יום {r.day} בחודש · מ־{monthLabelOf(r.startMonth)}{r.endMonth ? ` עד ${monthLabelOf(r.endMonth)}` : " ללא סיום"}
                  {!isEmptyVal(r.bonusAmount) && <div>בונוס: {fmt(r.bonusAmount)} כל {r.bonusEveryMonths} חודשים, החל מ־{monthLabelOf(r.bonusAnchorMonth)} (מחליף את הסכום הרגיל)</div>}
                </div>
                {dupes > 0 && <div style={{ fontSize: 11.5, color: "#8a6400", background: COLORS.amberLight, borderRadius: 8, padding: "5px 8px", marginTop: 6 }}>⚠️ יש {dupes} הכנסות ידניות לא מקושרות בחודשים שההכנסה הזו חלה בהם. ייתכן כפל; אפשר לקשר אותן ידנית.</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {[["עריכה", () => setMode({ edit: r.id })], ["קישור רשומות", () => setMode({ link: r.id })], ["מחיקה", () => del(r)]].map(([t, fn]) => (
                    <button key={t} onClick={fn} style={{ minHeight: 40, padding: "0 12px", borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "#fff", color: t === "מחיקה" ? COLORS.coral : COLORS.ink, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t}</button>
                  ))}
                </div>
                {mode && mode.edit === r.id && <RecurringIncomeForm initial={r} onCancel={() => setMode(null)} onSubmit={(out) => { onSave(recurringIncomes.map(x => x.id === r.id ? out : x)); setMode(null); }} />}
                {mode && mode.link === r.id && <IncomeLinkDialog r={r} incomeEntries={incomeEntries} recurringIncomes={recurringIncomes} onConfirm={onLink} onClose={() => setMode(null)} />}
              </div>
            );
          })}
          {mode === "new"
            ? <RecurringIncomeForm onCancel={() => setMode(null)} onSubmit={(out) => { onSave([...recurringIncomes, out]); setMode(null); }} />
            : <button onClick={() => setMode("new")} style={{ width: "100%", minHeight: 44, borderRadius: 12, border: `1.5px dashed ${COLORS.sage}`, background: "none", color: COLORS.sage, fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginTop: 6 }}>＋ הוספת הכנסה קבועה</button>}
        </div>
      )}
    </div>
  );
}

/* ================= FORECAST TAB ================= */
function ForecastTab({ monthDate, totalBudget, fixedExpenses, plannedExpenses, incomeEntries, onAddIncome, onRemoveIncome, budgets, categories, creditLag, onToggleCreditLag, openingBalance, onSetOpeningBalance, openingBalanceDate, onSetOpeningBalanceDate, creditBillingDay, onSetCreditBillingDay, variableOverrides, onSetVariableOverride, variableOverrideMeta, onSetVariableOverrideMeta, cards, onSaveCards, recurringIncomes, onSaveRecurring, onAddOverride, onLinkEntries, cashBudgets }) {
  const [openMonth, setOpenMonth] = useState(null);
  const [srcDraft, setSrcDraft] = useState("");
  const [amtDraft, setAmtDraft] = useState("");
  const [dayDraft, setDayDraft] = useState("1");
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [ovr, setOvr] = useState(null); // { key, rid, amount, day, err }
  const [newCardName, setNewCardName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);

  // עוגן יתרה עם תאריך: היתרה מתייחסת לתחילת היום שנבחר (לפני התנועות של אותו יום),
  // והחישוב סופר רק תנועות מהתאריך הזה והלאה, כי תנועות קודמות כבר משוקפות ביתרה.
  // כשהעוגן בחודש קודם התחזית מתחילה מאותו חודש, כדי שהתנועות שבין העוגן להיום לא יפלטו.
  const realNowKey = monthKey(new Date());
  const viewedKey = monthKey(monthDate);
  const anchorInfo = useMemo(() => {
    if (!openingBalanceDate) return null;
    const parts = String(openingBalanceDate).split("-").map(Number);
    if (parts.length !== 3 || parts.some((x) => !Number.isFinite(x))) return null;
    const [y, mo, da] = parts;
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    const key = `${y}-${String(mo).padStart(2, "0")}`;
    return { key, day: da, past: key < realNowKey, unsupported: monthsDiff(key, realNowKey) > 3,
             dateLabel: `${String(da).padStart(2, "0")}.${String(mo).padStart(2, "0")}.${y}` };
  }, [openingBalanceDate, realNowKey]);

  const months = useMemo(() => {
    const arr = [];
    const start = anchorInfo && !anchorInfo.unsupported && anchorInfo.key < viewedKey ? -monthsDiff(anchorInfo.key, viewedKey) : 0;
    for (let i = start; i <= 6; i++) {
      const d = new Date(monthDate.getFullYear(), monthDate.getMonth() + i, 1);
      arr.push({ key: monthKey(d), label: `${HEBREW_MONTHS[d.getMonth()]} ${d.getFullYear()}`, offset: i });
    }
    return arr;
  }, [monthDate, anchorInfo, viewedKey]);

  const rowsRaw = months.map((m) => {
    const isAnchorMonth = !!(anchorInfo && !anchorInfo.unsupported && m.key === anchorInfo.key);
    const fromDay = isAnchorMonth ? anchorInfo.day : 1;
    // יום בחודש תמיד בתחום החודש בפועל (למשל יום 31 בספטמבר מוצג כ־30), גם בסינון וגם בתצוגה.
    const dim = daysInMonthKey(m.key);
    const clampDay = (d) => Math.min(Number(d) || 1, dim);
    const inRange = (d) => clampDay(d) >= fromDay;
    const entries = incomeEntries.filter(e => e.monthKey === m.key && inRange(e.day));
    const recInfoFull = recurringIncomeItemsForMonth(recurringIncomes, incomeEntries, m.key);
    const recInfo = { ...recInfoFull, items: recInfoFull.items.filter(x => inRange(x.day)) };
    const recurringTotal = recInfo.items.reduce((s, x) => s + x.amount, 0);
    const income = entries.reduce((s, e) => s + Number(e.amount || 0), 0) + recurringTotal;
    const { direct: directFixedAll, creditFromPrev: creditFixed } = fixedForecastItemsForMonth(fixedExpenses, m.key);
    const directFixed = directFixedAll.filter(f => inRange(f.dueDay));
    const directFixedTotal = directFixed.reduce((s, f) => s + Number(f.amount || 0), 0);
    const creditFixedTotal = creditFixed.reduce((s, f) => s + Number(f.amount || 0), 0);
    const plannedForMonth = plannedExpenses.filter(p => p.date && p.date.startsWith(m.key) && inRange(p.date.split("-")[2]));
    const plannedTotal = plannedForMonth.reduce((s, p) => s + Number(p.amount || 0), 0);
    const sourceMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + m.offset - (creditLag ? 1 : 0), 1);
    const sourceMonthKey = monthKey(sourceMonthDate);
    const autoVariableSpend = budgetTotalForMonth(budgets, categories, sourceMonthKey);
    // חלוקה לפי אמצעי תשלום: החלק ששולם במזומן/ביט ירד מהבנק בחודש ההוצאה עצמו, ולכן מקטין את חיוב האשראי (של חודש המקור). חודש ללא חלוקה יורש את האחרונה שהוגדרה; ברירת מחדל: הכול אשראי.
    const cashOf = (k, total) => Math.min(Math.max(cashBudgetForMonth(cashBudgets, k).value, 0), Math.max(Number(total) || 0, 0));
    const sourceCash = cashOf(sourceMonthKey, autoVariableSpend);
    const autoVariableCredit = autoVariableSpend - sourceCash;
    const cashRaw = cashOf(m.key, budgetTotalForMonth(budgets, categories, m.key));
    // עוגן מתוארך (תחילת היום, כולל אותו יום): היתרה כבר משקפת תנועות שלפני יום העוגן, ולכן קניות המזומן נספרות
    // רק באופן יחסי מהיום הזה והלאה - כמו שאר התנועות המסוננות לפי fromDay. עוגן ביום 1 = כל החודש נספר.
    const cashAnchorDays = isAnchorMonth ? Math.max(dim - fromDay + 1, 0) : dim;
    const cashAnchorPartial = isAnchorMonth && cashRaw > 0 && cashAnchorDays < dim;
    const cashDirect = cashRaw * cashAnchorDays / dim;
    const autoCreditLump = creditFixedTotal + autoVariableCredit;
    const hasOverride = variableOverrides && Object.prototype.hasOwnProperty.call(variableOverrides, m.key);
    const ovrMeta = hasOverride ? ((variableOverrideMeta || {})[m.key] || null) : null;
    const globalCredit = hasOverride ? Number(variableOverrides[m.key]) || 0 : autoCreditLump;
    const includeGlobalCredit = !isAnchorMonth || inRange(creditBillingDay);
    // כרטיסים: עם override הידני הסכום מחליף את כל האשראי ולכן סכומי הכרטיסים לא מתווספים שוב
    const cardInfo = cardForecastForMonth(fixedExpenses, cards, m.key);
    const cardLines = (hasOverride ? [] : cardInfo.scheduled).filter(cl => !isAnchorMonth || inRange(cl.day));
    const cardTotal = cardLines.reduce((t, c) => t + c.total, 0);
    const unscheduled = hasOverride ? [] : cardInfo.unscheduled;
    const partial = unscheduled.length > 0;
    const creditLump = (includeGlobalCredit ? globalCredit : 0) + cardTotal;
    const balance = income - directFixedTotal - creditLump - cashDirect - plannedTotal;

    // build day-by-day timeline
    const events = [];
    entries.forEach(e => events.push({ day: clampDay(e.day), label: `💰 ${e.source}${e.recurringIncomeId ? " · עוקף קבועה" : ""}`, amount: Number(e.amount) || 0 }));
    recInfo.items.forEach(x => events.push({ day: clampDay(x.day), label: `💰 ${x.r.name} · קבועה${x.bonus ? " · בונוס" : ""}`, amount: x.amount }));
    directFixed.forEach(f => events.push({ day: clampDay(f.dueDay), label: `📎 ${f.name}${f.effectiveTo === m.key ? " · חודש אחרון" : ""}`, amount: -(Number(f.amount) || 0) }));
    plannedForMonth.forEach(p => events.push({ day: Number(p.date.split("-")[2]) || 1, label: `📌 ${p.name}`, amount: -(Number(p.amount) || 0) }));
    if (includeGlobalCredit && globalCredit > 0) {
      const ovrStatusLabel = ovrMeta && ovrMeta.status === "partial" ? " · חלקי" : ovrMeta && ovrMeta.status === "final" ? " · סופי" : "";
      const label = hasOverride ? `💳 חיוב אשראי (ידני)${ovrStatusLabel}` : `💳 חיוב אשראי (${fmt(creditFixedTotal)} קבועות + ${fmt(autoVariableCredit)} משתנה באשראי)`;
      events.push({ day: clampDay(creditBillingDay), label, amount: -globalCredit });
    }
    cardLines.forEach(cl => events.push({ day: clampDay(cl.day), label: `💳 ${cl.card.name || "כרטיס"} · הערכה לפי הגדרות הכרטיס (${cl.items.length} הוצאות)`, amount: -cl.total }));
    events.sort((a, b) => a.day - b.day || (b.amount - a.amount));

    const keep = !anchorInfo ? m.offset >= 1 : (anchorInfo.unsupported ? false : m.key >= anchorInfo.key);
    return { ...m, isAnchorMonth, fromDay, entries, income, directFixedTotal, creditFixedTotal, autoVariableSpend, sourceMonthKey, sourceCash, autoVariableCredit, cashRaw, cashDirect, cashAnchorPartial, cashAnchorDays, dimDays: dim, creditLump, plannedForMonth, plannedTotal, hasOverride, ovrMeta, balance, recInfo, globalCredit, cardLines, cardTotal, unscheduled, partial, events, keep };
  }).filter(r => r.keep);

  let running = Number(openingBalance) || 0;
  let runPartial = false;
  const rows = rowsRaw.map((r) => {
    runPartial = runPartial || r.partial;
    const openingForMonth = running;
    let bal = openingForMonth;
    let minBal = openingForMonth;
    let minDay = r.fromDay || 1;
    // קניות מזומן/ביט מתפרסות שווה בשווה על ימות החודש לצורך הערכת היתרה היומית (אין תאריך ידוע לתזמון האמיתי)
    const cashPerDay = r.cashDirect > 0 ? r.cashDirect / Math.max(r.dimDays - (r.fromDay || 1) + 1, 1) : 0;
    let prevDay = (r.fromDay || 1) - 1;
    const timeline = r.events.map(ev => {
      bal -= cashPerDay * (ev.day - prevDay);
      if (bal < minBal) { minBal = bal; minDay = ev.day; }
      bal += ev.amount;
      prevDay = ev.day;
      if (bal < minBal) { minBal = bal; minDay = ev.day; }
      return { ...ev, after: bal };
    });
    bal -= cashPerDay * (r.dimDays - prevDay);
    if (bal < minBal) { minBal = bal; minDay = r.dimDays; }
    // שורת סגירה: כשהפיזור היומי של המזומן ממשיך אחרי האירוע המתוארך האחרון, מציגים את ההשלמה כדי שהתזרים יסתדר עם יתרת סוף החודש
    const cashTail = cashPerDay * (r.dimDays - prevDay);
    if (cashTail > 0.004) {
      timeline.push({ day: r.dimDays, label: `🏁 סוף חודש · יתרה משוערת אחרי פיזור מזומן/ביט (השלמת ${fmt(cashTail)})`, amount: -cashTail, after: bal, closing: true });
    }
    running += r.balance;
    return { ...r, openingForMonth, running, timeline, minBal, minDay, runPartial };
  });

  // סיווג ירידה למינוס לכל חודש: cross = חציית אפס, deep = שפל נמוך משפל החודש הקודם (המינוס מעמיק),
  // recover = נסיגה מהמינוס עד לפלוס בסוף החודש, shrink = המינוס נשאר אבל מתכווץ
  let prevMin = null;
  rows.forEach(r => {
    r.dipKind = r.minBal >= 0 ? null
      : r.openingForMonth >= 0 ? "cross"
      : r.minBal < (prevMin != null ? prevMin : r.openingForMonth) ? "deep"
      : r.running >= 0 ? "recover" : "shrink";
    prevMin = r.minBal;
  });

  const addIncomeHere = (mKey) => {
    if (!srcDraft.trim() || !Number(amtDraft)) return;
    onAddIncome(mKey, srcDraft.trim(), Number(amtDraft), Number(dayDraft) || 1);
    setSrcDraft(""); setAmtDraft(""); setDayDraft("1");
  };

  return (
    <div>
      <div style={{ margin: "6px 2px 4px", fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 15 }}>תחזית 6 חודשים</div>
      <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 12 }}>
        לחיצה על חודש בטבלה פותחת את הפירוט היומי המלא, כולל הנקודה הנמוכה בחודש
      </div>

      {anchorInfo && anchorInfo.unsupported && (
        <div role="alert" style={{ background: COLORS.amberLight, color: "#8a6400", borderRadius: 12, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>
          ⚠️ תאריך היתרה ישן מדי לחישוב אמין (יותר מ־3 חודשים אחורה), והתחזית לא מוצגת. עדכנו יתרה ותאריך עדכניים, או נקו את שדה התאריך כדי לחזור לחישוב הרגיל.
        </div>
      )}
      {anchorInfo && !anchorInfo.unsupported && anchorInfo.past && (
        <div role="note" style={{ background: COLORS.amberLight, color: "#8a6400", borderRadius: 12, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>
          ℹ️ תאריך היתרה לפני החודש הנוכחי. התנועות שבין התאריך להיום מחושבות רק מנתוני התכנון באפליקציה (הכנסות והוצאות מתוכננות), בלי תנועות בנק בפועל. אם היו תנועות נוספות, עדכנו יתרה ותאריך עדכניים.
        </div>
      )}
      {anchorInfo && !anchorInfo.unsupported && rows.length === 0 && (
        <div role="note" style={{ background: COLORS.amberLight, color: "#8a6400", borderRadius: 12, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>
          ℹ️ תאריך היתרה שנבחר מאוחר מתקופת התחזית. בחרו תאריך מוקדם יותר או נקו את שדה התאריך.
        </div>
      )}

      {(rows.some(r => r.partial) || rows.some(r => r.minBal < 0)) && (() => {
        const negRows = rows.filter(r => r.minBal < 0);
        const crossRows = negRows.filter(r => r.dipKind === "cross");
        const deepRows = negRows.filter(r => r.dipKind === "deep");
        const anyPartial = rows.some(r => r.partial);
        const worst = negRows.reduce((a, b) => (b.minBal < a.minBal ? b : a), negRows[0] || null);
        const dipSummary = crossRows.length === 1 && deepRows.length === 0
          ? `${crossRows[0].label}: ירידה צפויה למינוס, עד ${fmt(crossRows[0].minBal)} ביום ${crossRows[0].minDay}`
          : crossRows.length > 0
            ? `ירידה צפויה למינוס ב${crossRows[0].label} · הנמוכה ביותר: ${worst.label}, עד ${fmt(worst.minBal)} ביום ${worst.minDay}`
            : deepRows.length > 0
              ? `המינוס מעמיק · הנמוכה ביותר: ${worst.label}, עד ${fmt(worst.minBal)} ביום ${worst.minDay}`
              : "";
        const partialSummary = anyPartial ? "חלק מהיתרות חלקיות (יש סכומים שטרם שובצו לתזרים)" : "";
        return (
          <div style={{ background: COLORS.amberLight, borderRadius: 12, padding: "4px 12px", marginBottom: 10 }}>
            <button onClick={() => setWarnOpen(o => !o)} aria-expanded={warnOpen} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, border: "none", background: "none", cursor: "pointer", minHeight: 40, padding: 0, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: negRows.length ? COLORS.coral : "#8a6400", textAlign: "right", lineHeight: 1.5 }}>
              <span>⚠️ {[dipSummary, partialSummary].filter(Boolean).join(" · ")}</span>
              <span style={{ flexShrink: 0, fontSize: 11, color: "#8a6400", fontWeight: 600 }}>{warnOpen ? "סגירה ▴" : "פירוט ▾"}</span>
            </button>
            {warnOpen && (
              <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 10, fontSize: 12.5, fontWeight: 600, color: "#8a6400", lineHeight: 1.6 }}>
                {anyPartial && (
                  <div>⚠️ חלק מהיתרות חלקיות: יש הוצאות קבועות באשראי של כרטיסים שטרם הוגדר להם יום חיוב או חודש חיוב. הסכומים מוצגים בנפרד בפירוט החודש ("טרם שובץ לתזרים") ואינם כלולים ביתרה.</div>
                )}
                {negRows.map(r => (
                  <div key={r.key} style={{ color: COLORS.coral }}>⚠️ {r.label}: {r.dipKind === "cross" ? `ירידה צפויה למינוס, עד ${fmt(r.minBal)} ביום ${r.minDay} לחודש${r.running >= 0 ? " — מתאזנת עד סוף החודש" : " — וגם סוף החודש נשאר במינוס"}` : r.dipKind === "deep" ? `המינוס מעמיק, עד ${fmt(r.minBal)} ביום ${r.minDay} לחודש` : r.dipKind === "recover" ? `התאוששות מהמינוס — שפל ${fmt(r.minBal)} ביום ${r.minDay} לחודש, חזרה לפלוס עד סוף החודש` : `המינוס מתכווץ — שפל ${fmt(r.minBal)} ביום ${r.minDay} לחודש`}{r.runPartial ? " (חלקי)" : ""}</div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ fontSize: 11, color: COLORS.sub, margin: "0 2px 8px", lineHeight: 1.5 }}>
        {openingBalanceDate && anchorInfo
          ? `היתרות משוערות על בסיס יתרת פתיחה ${fmt(openingBalance)} נכון ל־${anchorInfo.dateLabel} ולא אומתו מול הבנק`
          : `היתרות משוערות בלבד: יתרת הפתיחה (${fmt(openingBalance)}) הוזנה ללא תאריך ולא אומתה מול הבנק. עיגון לתאריך זמין בהגדרות התחזית`}
      </div>
      <div style={{ background: COLORS.card, borderRadius: 16, padding: "4px 12px 8px", marginBottom: 14, boxShadow: "0 2px 10px rgba(20,33,61,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 2px", fontSize: 11, fontWeight: 700, color: COLORS.sub, borderBottom: `1px solid ${COLORS.mist}` }}>
          <span style={{ flex: 1, minWidth: 0 }}>חודש</span>
          <span style={{ width: 80, textAlign: "left", flexShrink: 0 }}>שינוי חודשי</span>
          <span style={{ width: 92, textAlign: "left", flexShrink: 0 }}>יתרה משוערת</span>
          <span style={{ width: 14, flexShrink: 0 }} />
        </div>
      {rows.map((r) => (
        <div key={r.key} style={{ borderBottom: `1px solid ${COLORS.mist}` }}>
          <div onClick={() => setExpandedMonth(expandedMonth === r.key ? null : r.key)} role="button" aria-expanded={expandedMonth === r.key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", minHeight: 48, padding: "7px 2px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 13.5 }}>{r.label}{r.isAnchorMonth && anchorInfo ? ` · מ־${anchorInfo.day} בחודש` : ""}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                {r.isAnchorMonth && anchorInfo && <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.sage, background: COLORS.sageLight, borderRadius: 6, padding: "2px 6px" }}>יתרה מתחילת {anchorInfo.dateLabel}</span>}
                {r.dipKind === "cross" && <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.coral, background: COLORS.coralLight, borderRadius: 6, padding: "2px 6px" }}>ירידה למינוס</span>}
                {r.dipKind === "deep" && <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.coral, background: COLORS.coralLight, borderRadius: 6, padding: "2px 6px" }}>המינוס מעמיק</span>}
              </div>
            </div>
            <div style={{ width: 80, textAlign: "left", flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: r.balance >= 0 ? COLORS.sage : COLORS.coral }}>{r.balance >= 0 ? "+" : ""}{fmt(r.balance)}</div>
            <div style={{ width: 92, textAlign: "left", flexShrink: 0 }}>
              <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 800, fontSize: 15, color: r.running >= 0 ? COLORS.sage : COLORS.coral, lineHeight: 1.25 }}>{fmt(r.running)}</div>
              {r.runPartial && <div style={{ fontSize: 10, fontWeight: 700, color: "#8a6400" }}>חלקי</div>}
            </div>
            <span style={{ width: 14, flexShrink: 0, color: COLORS.sub, fontSize: 12, textAlign: "center" }}>{expandedMonth === r.key ? "▲" : "▼"}</span>
          </div>

          {expandedMonth === r.key && (
            <div style={{ marginTop: 2, borderTop: `1px dashed ${COLORS.mist}`, paddingTop: 8, paddingBottom: 8 }}>
              <Row label="הכנסות" value={fmt(r.income)} />
              {(r.recInfo.items.length > 0 || r.recInfo.overridden.length > 0) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "2px 0 6px" }}>
                  {r.recInfo.items.map(x => (
                    <div key={x.r.id} style={{ background: COLORS.sageLight, borderRadius: 8, padding: "6px 8px", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <span style={{ overflowWrap: "anywhere", minWidth: 0 }}><b style={{ color: COLORS.sage }}>קבועה</b>{x.bonus ? " · בונוס" : ""} · {x.r.name} (יום {x.day})</span>
                        <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{fmt(x.amount)}</span>
                      </div>
                      {ovr && ovr.key === r.key && ovr.rid === x.r.id ? (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div><label style={labelStyle}>סכום לחודש זה (₪, 0 = דילוג)</label>
                              <input aria-label="סכום לחודש זה" type="number" inputMode="decimal" min="0" value={ovr.amount} onChange={e => setOvr({ ...ovr, amount: e.target.value, err: "" })} style={{ ...inputStyle, height: 40, fontSize: 16 }} /></div>
                            <div><label style={labelStyle}>יום (לא חובה)</label>
                              <input aria-label="יום בחודש" type="number" inputMode="numeric" min="1" max="31" placeholder={String(x.day)} value={ovr.day} onChange={e => setOvr({ ...ovr, day: e.target.value, err: "" })} style={{ ...inputStyle, height: 40, fontSize: 16 }} /></div>
                          </div>
                          {ovr.err && <div role="alert" style={{ color: COLORS.coral, fontSize: 12, fontWeight: 600, marginTop: 6 }}>{ovr.err}</div>}
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button onClick={() => setOvr(null)} style={{ flex: 1, minHeight: 40, borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>ביטול</button>
                            <button onClick={() => {
                              const d = ovr.day === "" ? null : Number(ovr.day);
                              const e = validateIncomeOverride(x.r.id, r.key, ovr.amount, incomeEntries) || (d !== null && (!Number.isInteger(d) || d < 1 || d > 31) ? "היום חייב להיות בין 1 ל־31" : "");
                              if (e) return setOvr({ ...ovr, err: e });
                              onAddOverride(x.r.id, r.key, Number(ovr.amount), d); setOvr(null);
                            }} style={{ flex: 1, minHeight: 40, borderRadius: 10, border: "none", background: COLORS.sage, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>שמירה לחודש זה בלבד</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setOvr({ key: r.key, rid: x.r.id, amount: "", day: "", err: "" })} style={{ border: "none", background: "none", color: COLORS.sage, fontSize: 12, fontWeight: 700, textDecoration: "underline", cursor: "pointer", minHeight: 32, padding: 0, marginTop: 2 }}>שנה לחודש זה</button>
                      )}
                    </div>
                  ))}
                  {r.recInfo.overridden.map(o => (
                    <div key={o.r.id} style={{ background: COLORS.amberLight, color: "#8a6400", borderRadius: 8, padding: "6px 8px", fontSize: 12 }}>
                      <b>עוקף קבועה</b> · {o.r.name}: {fmt(o.entry.amount)} במקום {fmt(o.calc.amount)}{o.calc.bonus ? " (בונוס)" : ""}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ background: COLORS.paper, borderRadius: 10, padding: "8px 10px", margin: "4px 0 8px" }}>
                {!r.hasOverride && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, fontWeight: 800 }}>
                      <span>📎 הוצאות קבועות</span>
                      <span style={{ color: COLORS.coral }}>-{fmt(r.directFixedTotal + r.cardLines.reduce((t, c) => t + c.total, 0) + r.creditFixedTotal)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.sub, lineHeight: 1.7, marginTop: 2 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span>· חיוב ישיר מהבנק</span><span>{fmt(r.directFixedTotal)}</span></div>
                      {r.cardLines.map(cl => <div key={cl.card.id} style={{ display: "flex", justifyContent: "space-between" }}><span>· 💳 {cl.card.name || "כרטיס"} (יום {cl.day})</span><span>{fmt(cl.total)}</span></div>)}
                      {r.creditFixedTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>· 💳 קבועות באשראי ללא כרטיס משויך</span><span>{fmt(r.creditFixedTotal)}</span></div>}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, fontWeight: 800, marginTop: 8 }}>
                      <span>🛒 הוצאות משתנות (תקציב)</span>
                      <span style={{ color: COLORS.coral }}>-{fmt(r.cashDirect + r.autoVariableCredit)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.sub, lineHeight: 1.7, marginTop: 2 }}>
                      {r.cashDirect > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>· מזומן/ביט (יורד מהבנק באותו חודש)</span><span>{fmt(r.cashDirect)}</span></div>}
                      {r.autoVariableCredit > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>· באשראי (בתוך החיוב הגלובלי למטה)</span><span>{fmt(r.autoVariableCredit)}</span></div>}
                    </div>
                  </div>
                )}
                {r.hasOverride && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, fontWeight: 800 }}>
                      <span>📎 קבועות בחיוב ישיר</span>
                      <span style={{ color: COLORS.coral }}>-{fmt(r.directFixedTotal)}</span>
                    </div>
                    {r.cashDirect > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, fontWeight: 800, marginTop: 6 }}>
                      <span>🛒 משתנות במזומן/ביט</span>
                      <span style={{ color: COLORS.coral }}>-{fmt(r.cashDirect)}</span>
                    </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, fontWeight: 800, marginTop: 6 }}>
                      <span>💳 אשראי (ידני)</span>
                      <span style={{ color: COLORS.coral }}>-{fmt(r.creditLump)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.sub, lineHeight: 1.6, marginTop: 2 }}>הסכום האשראי הידני כולל קבועות ומשתנות יחד, ללא פירוט; ניתן לעריכה ולסימון חלקי/סופי למטה</div>
                  </div>
                )}
              </div>
              {r.cashAnchorPartial && (
                <div role="note" style={{ fontSize: 12, color: "#8a6400", background: COLORS.amberLight, borderRadius: 8, padding: "6px 8px", margin: "4px 0", lineHeight: 1.5 }}>
                  ℹ️ קניות במזומן/ביט: נספרים {fmt(r.cashDirect)} מתוך {fmt(r.cashRaw)}, הערכה לפי פיזור שווה מה־{r.fromDay} בחודש והלאה. החלק שלפני כן משוקף כבר ביתרת הפתיחה{anchorInfo ? ` של ${anchorInfo.dateLabel}` : ""} ואינו נספר שוב.
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 13.5 }}>
                <span style={{ color: COLORS.sub, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>חיוב אשראי {r.hasOverride ? "(ידני)" : "(מוערך: קבועות+משתנה)"}
                  {r.ovrMeta && r.ovrMeta.status === "partial" && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8a6400", background: COLORS.amberLight, borderRadius: 6, padding: "1px 6px" }}>חלקי</span>}
                  {r.ovrMeta && r.ovrMeta.status === "final" && <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.sage, background: COLORS.sageLight, borderRadius: 6, padding: "1px 6px" }}>סופי</span>}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input key={r.key + "-" + r.creditLump} type="number" defaultValue={r.creditLump} onBlur={(e) => {
                    const raw = e.target.value.trim();
                    // מיקוד ויציאה בלי שינוי לא יוצרים עקיפה ידנית, כדי שהאומדן האוטומטי ימשיך להתעדכן.
                    // ניקוי השדה מאפס לאומדן האוטומטי; שינוי ערך בפועל שומר עקיפה ידנית כרגיל.
                    if (raw === "") { onSetVariableOverride(r.key, null); return; }
                    const v = Number(raw);
                    if (!Number.isFinite(v) || v === r.creditLump) return;
                    onSetVariableOverride(r.key, v);
                  }}
                    style={{ width: 80, padding: "3px 6px", borderRadius: 6, border: `1px solid ${COLORS.mist}`, fontSize: 12.5, textAlign: "center" }} />
                  {r.hasOverride && <button onClick={() => onSetVariableOverride(r.key, null)} style={{ border: "none", background: "none", color: COLORS.sage, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>איפוס</button>}
                </span>
              </div>
              {r.cardLines.length > 0 && (
                <div style={{ fontSize: 11.5, color: COLORS.sub, padding: "0 0 4px", lineHeight: 1.6 }}>
                  <div>מתוך סך האשראי: גלובלי {fmt(r.globalCredit)} ({fmt(r.creditFixedTotal)} קבועות + {fmt(r.autoVariableCredit)} משתנה) · פירוט הכרטיסים למעלה תחת 📎 קבועות</div>
                </div>
              )}
              {r.sourceCash > 0 && (
                <div style={{ fontSize: 11.5, color: COLORS.sub, padding: "0 0 4px", lineHeight: 1.6 }}>
                  חלק המזומן/ביט של התקציב המשתנה של {monthLabelOf(r.sourceMonthKey)} ({fmt(r.sourceCash)}) ירד מהבנק באותו חודש, ואינו חלק מסכום האשראי המוערך
                </div>
              )}
              {r.hasOverride && cards.length > 0 && <div style={{ fontSize: 11.5, color: COLORS.sub, paddingBottom: 4 }}>הסכום הידני מחליף את כל סכומי האשראי בחודש זה, כולל כרטיסים</div>}
              {r.hasOverride && (
                <div style={{ background: COLORS.paper, borderRadius: 8, padding: "6px 8px", margin: "2px 0 6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.sub, flexWrap: "wrap" }}>
                    <span>סטטוס החיוב:</span>
                    <button onClick={() => onSetVariableOverrideMeta(r.key, { status: r.ovrMeta && r.ovrMeta.status === "partial" ? "" : "partial" })} style={{ minHeight: 32, borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${r.ovrMeta && r.ovrMeta.status === "partial" ? "#8a6400" : COLORS.mist}`, background: r.ovrMeta && r.ovrMeta.status === "partial" ? COLORS.amberLight : "#fff", color: r.ovrMeta && r.ovrMeta.status === "partial" ? "#8a6400" : COLORS.sub }}>חלקי</button>
                    <button onClick={() => onSetVariableOverrideMeta(r.key, { status: r.ovrMeta && r.ovrMeta.status === "final" ? "" : "final" })} style={{ minHeight: 32, borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${r.ovrMeta && r.ovrMeta.status === "final" ? COLORS.sage : COLORS.mist}`, background: r.ovrMeta && r.ovrMeta.status === "final" ? COLORS.sageLight : "#fff", color: r.ovrMeta && r.ovrMeta.status === "final" ? COLORS.sage : COLORS.sub }}>סופי</button>
                  </div>
                  <input key={r.key + "-note-" + ((r.ovrMeta && r.ovrMeta.note) || "")} type="text" maxLength={60} defaultValue={(r.ovrMeta && r.ovrMeta.note) || ""} placeholder="הערה קצרה (למשל: לא כולל מקס ועסקאות ממתינות)" onBlur={(e) => { const v = e.target.value.trim(); if (v !== ((r.ovrMeta && r.ovrMeta.note) || "")) onSetVariableOverrideMeta(r.key, { note: v }); }} style={{ marginTop: 6, width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 6, border: `1px solid ${COLORS.mist}`, fontSize: 12 }} />
                </div>
              )}
              {r.unscheduled.map(u => (
                <div key={u.cardId} role="alert" style={{ fontSize: 12, color: "#8a6400", background: COLORS.amberLight, borderRadius: 8, padding: "6px 8px", margin: "4px 0", lineHeight: 1.5 }}>
                  ⏳ טרם שובץ לתזרים: {u.name} — {fmt(u.total)} <span style={{ opacity: 0.85 }}>({u.why || "חסרות הגדרות חיוב"})</span>
                </div>
              ))}
              {r.plannedTotal > 0 && <Row label="הוצאות מתוכננות חד-פעמיות" value={"-" + fmt(r.plannedTotal)} />}
              <div style={{ borderTop: `1px solid ${COLORS.mist}`, marginTop: 6, paddingTop: 6 }}>
                <Row label={r.runPartial ? "יתרה מצטברת חלקית" : "יתרה מצטברת עד חודש זה"} value={fmt(r.running)} bold color={r.running >= 0 ? COLORS.sage : COLORS.coral} />
                {r.runPartial && <div style={{ fontSize: 11.5, color: "#8a6400", marginTop: 2 }}>⚠️ היתרה חלקית: אינה כוללת סכומים שטרם שובצו לתזרים (בחודש זה או בחודשים קודמים)</div>}
              </div>

              <div style={{ marginTop: 10, background: COLORS.paper, borderRadius: 10, padding: "8px 10px" }}>
                <div style={{ fontSize: 11.5, color: COLORS.sub, marginBottom: 6 }}>{r.isAnchorMonth && anchorInfo ? `יתרה בתחילת ${anchorInfo.dateLabel}: ${fmt(r.openingForMonth)}` : `יתרת פתיחה לחודש: ${fmt(r.openingForMonth)}`}</div>
                {r.minBal < r.openingForMonth && <div style={{ fontSize: 11, fontWeight: 600, color: r.minBal < 0 ? COLORS.coral : COLORS.sub, marginBottom: 6 }}>נקודה נמוכה משוערת בחודש: {fmt(r.minBal)} ביום {r.minDay}</div>}
                {r.cashDirect > 0 && <div style={{ fontSize: 11, color: COLORS.sub, marginBottom: 6 }}>קניות מזומן/ביט ({fmt(r.cashDirect)}) מתפרסות שווה בשווה על {r.isAnchorMonth ? `ימי החודש מה־${r.fromDay} ואילך` : "ימות החודש"} לצורך ההערכה היומית; התזמון בפועל משתנה.</div>}
                {r.isAnchorMonth && <div style={{ fontSize: 11, color: COLORS.sub, marginBottom: 6 }}>מוצגות תנועות מה־{r.fromDay} בחודש והלאה (כולל אותו יום). תנועות מוקדמות יותר משוקפות ביתרה ואינן נספרות שוב.</div>}
                {r.timeline.length === 0 && <div style={{ fontSize: 12, color: COLORS.sub }}>אין עדיין אירועים מתוכננים החודש</div>}
                {r.timeline.map((ev, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "5px 0", borderBottom: i === r.timeline.length - 1 ? "none" : `1px solid ${COLORS.mist}` }}>
                    <span style={{ color: COLORS.sub, width: 28 }}>{ev.day}</span>
                    <span style={{ flex: 1, fontStyle: ev.closing ? "italic" : "normal", color: ev.closing ? COLORS.sub : "inherit" }}>{ev.label}</span>
                    <span style={{ fontWeight: 600, color: ev.amount >= 0 ? COLORS.sage : COLORS.coral, marginLeft: 8 }}>{ev.amount >= 0 ? "+" : ""}{fmt(ev.amount)}</span>
                    <span style={{ width: 90, textAlign: "left", fontSize: 11, color: ev.after < 0 ? COLORS.coral : COLORS.sub, fontWeight: ev.after < 0 ? 700 : 400 }}>{fmt(ev.after)}</span>
                  </div>
                ))}
              </div>

              {r.plannedForMonth.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {r.plannedForMonth.map(p => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: COLORS.coral, background: COLORS.coralLight, borderRadius: 8, padding: "5px 8px" }}>
                      <span>📌 {p.name} ({p.date.split("-").reverse().join("/")})</span>
                      <span>{fmt(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {r.entries.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {r.entries.map(e => (
                    <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: COLORS.sub, background: COLORS.paper, borderRadius: 8, padding: "5px 8px" }}>
                      <span>{e.source} (יום {e.day || 1}){e.recurringIncomeId ? <b style={{ color: "#8a6400" }}> · {(recurringIncomes || []).some(x => x.id === e.recurringIncomeId) ? "עוקף קבועה" : "הייתה מקושרת לקבועה שנמחקה"}</b> : null}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>{fmt(e.amount)}
                        <button onClick={() => onRemoveIncome(e.id)} style={{ border: "none", background: "none", color: COLORS.coral, cursor: "pointer", fontSize: 12 }}>✕</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {openMonth === r.key ? (
                <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  <input placeholder="מקור" value={srcDraft} onChange={e => setSrcDraft(e.target.value)} style={{ ...selectStyle, flex: 2 }} />
                  <input type="number" placeholder="סכום" value={amtDraft} onChange={e => setAmtDraft(e.target.value)} style={{ ...selectStyle, flex: 1 }} />
                  <input type="number" placeholder="יום" min="1" max="31" value={dayDraft} onChange={e => setDayDraft(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: 50 }} />
                  <button onClick={() => addIncomeHere(r.key)} style={{ border: "none", borderRadius: 8, background: COLORS.sage, color: "#fff", padding: "0 12px", fontWeight: 700, cursor: "pointer" }}>✓</button>
                </div>
              ) : (
                <button onClick={() => setOpenMonth(r.key)} style={{ marginTop: 10, width: "100%", padding: "8px", borderRadius: 9, border: `1.5px dashed ${COLORS.sage}`, background: "none", color: COLORS.sage, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>＋ הוספת הכנסה</button>
              )}
            </div>
          )}
        </div>
      ))}
      </div>

      <div style={{ background: COLORS.card, borderRadius: 14, padding: "6px 14px", marginBottom: 14 }}>
        <button onClick={() => setSettingsOpen(o => !o)} aria-expanded={settingsOpen} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", border: "none", background: "none", minHeight: 44, cursor: "pointer", fontSize: 13, fontWeight: 700, color: COLORS.ink, padding: 0 }}>
          <span>⚙️ הגדרות תחזית</span><span style={{ color: COLORS.sub, fontSize: 12 }}>{settingsOpen ? "סגירה ▴" : "פתיחה ▾"}</span>
        </button>
        {settingsOpen && (
          <div style={{ paddingBottom: 12 }}>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>מועד חיוב האשראי</label>
              <button onClick={onToggleCreditLag} style={{
                display: "flex", alignItems: "center", gap: 6, border: "none", background: creditLag ? COLORS.sageLight : COLORS.card,
                color: creditLag ? COLORS.sage : COLORS.sub, padding: "6px 10px", borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: "pointer"
              }}>
                💳 חיוב אשראי בחודש הבא {creditLag ? "✓" : ""}
              </button>
            </div>
            <div style={{ background: COLORS.paper, borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
              <label style={labelStyle}>יתרת פתיחה בבנק</label>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: "0 1 140px" }}>
                  <input type="number" defaultValue={openingBalance} onBlur={(e) => onSetOpeningBalance(Number(e.target.value) || 0)}
                    style={{ ...inputStyle, textAlign: "center", fontWeight: 700 }} />
                </div>
                <div style={{ flex: "0 1 175px" }}>
                  <label style={labelStyle}>נכון לתאריך</label>
                  <input type="date" value={openingBalanceDate || ""} onChange={(e) => onSetOpeningBalanceDate(e.target.value)}
                    style={{ ...inputStyle }} />
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.sub, marginTop: 6, lineHeight: 1.5 }}>
                {openingBalanceDate
                  ? "היתרה מתייחסת לתחילת היום שנבחר, לפני התנועות של אותו יום. התחזית סופרת רק תנועות מהתאריך והלאה (כולל אותו יום), ותנועות קודמות לא נספרות פעמיים. אם היתרה בבנק כבר כוללת את תנועות היום, בחרו את התאריך של מחר."
                  : "ללא תאריך, היתרה נחשבת יתרת פתיחה של חודש התחזית הראשון (החודש הבא)."}
              </div>
            </div>
            <div style={{ background: COLORS.paper, borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
              <label style={labelStyle}>יום חיוב אשראי בחודש</label>
              <input type="number" min="1" max="31" defaultValue={creditBillingDay} onBlur={(e) => { const v = Number(e.target.value); if (!Number.isInteger(v) || v < 1 || v > 31) { e.target.value = String(creditBillingDay); e.target.setCustomValidity("יום החיוב חייב להיות מספר שלם בין 1 ל־31"); e.target.reportValidity(); return; } e.target.setCustomValidity(""); onSetCreditBillingDay(v); }}
                style={{ ...inputStyle, maxWidth: 100, textAlign: "center", fontWeight: 700 }} />
            </div>

            <RecurringIncomesPanel recurringIncomes={recurringIncomes} incomeEntries={incomeEntries} onSave={onSaveRecurring} onLink={onLinkEntries} />

            <div style={{ borderTop: `1px solid ${COLORS.mist}`, marginTop: 12, paddingTop: 6 }}>
              <button onClick={() => setCardsOpen(o => !o)} aria-expanded={cardsOpen} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", border: "none", background: "none", minHeight: 44, cursor: "pointer", fontSize: 13, fontWeight: 700, color: COLORS.ink, padding: 0 }}>
                <span>💳 ניהול כרטיסי אשראי ({cards.length})</span><span style={{ color: COLORS.sub, fontSize: 12 }}>{cardsOpen ? "סגירה ▴" : "פתיחה ▾"}</span>
              </button>
              {cardsOpen && (
                <div style={{ paddingBottom: 12 }}>
                  <div style={{ fontSize: 11.5, color: COLORS.sub, lineHeight: 1.5, marginBottom: 8 }}>
                    כרטיס נכנס לתחזית רק אחרי שהוגדרו לו יום חיוב וחודש חיוב. אין ערכי ברירת מחדל, והמועד בתחזית הוא הערכה לפי ההגדרות שהזנת ולא מועד בנקאי מאומת. הוצאות ללא כרטיס ממשיכות לפי ההגדרה הגלובלית.
                  </div>
                  {cards.map(c => {
                    const used = fixedExpenses.filter(f => f.cardId === c.id).length;
                    const miss = cardMissingSettings(c);
                    const upd = (patch) => onSaveCards(cards.map(x => x.id === c.id ? { ...x, ...patch } : x));
                    const sel = { height: 40, borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "#fff", fontSize: 15, fontFamily: "inherit", minWidth: 0, padding: "0 6px" };
                    return (
                      <div key={c.id} style={{ borderTop: `1px solid ${COLORS.mist}`, padding: "10px 0" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input aria-label="שם הכרטיס" defaultValue={c.name} placeholder="שם הכרטיס" onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.name) upd({ name: v }); }}
                            style={{ ...sel, flex: 1, fontWeight: 700, fontSize: 16 }} />
                          {used === 0
                            ? <button aria-label="מחיקת כרטיס" onClick={() => onSaveCards(cards.filter(x => x.id !== c.id))} style={{ width: 44, height: 40, borderRadius: 10, border: "none", background: COLORS.paper, color: COLORS.coral, cursor: "pointer", fontSize: 16 }}>🗑</button>
                            : <span style={{ fontSize: 11, color: COLORS.sub, whiteSpace: "nowrap" }}>בשימוש ב־{used}</span>}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                          <div><label style={labelStyle}>יום חיוב</label>
                            <select aria-label="יום חיוב" value={Number.isInteger(c.billingDay) ? String(c.billingDay) : ""} onChange={e => upd({ billingDay: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...sel, width: "100%" }}>
                              <option value="">לא הוגדר</option>
                              {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                            </select></div>
                          <div><label style={labelStyle}>חודש החיוב</label>
                            <select aria-label="חודש החיוב" value={Number.isInteger(c.lag) ? String(c.lag) : ""} onChange={e => upd({ lag: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...sel, width: "100%" }}>
                              <option value="">לא הוגדר</option>
                              <option value="0">באותו חודש ההוצאה</option>
                              <option value="1">חודש אחרי</option>
                              <option value="2">חודשיים אחרי</option>
                              <option value="3">3 חודשים אחרי</option>
                            </select></div>
                        </div>
                        {miss && <div style={{ fontSize: 11.5, color: "#8a6400", background: COLORS.amberLight, borderRadius: 8, padding: "5px 8px", marginTop: 6 }}>⚠️ {miss} — הכרטיס לא ישובץ בתזרים</div>}
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8, borderTop: cards.length ? `1px solid ${COLORS.mist}` : "none", paddingTop: 10 }}>
                    <input aria-label="שם כרטיס חדש" value={newCardName} onChange={e => setNewCardName(e.target.value)} placeholder="שם כרטיס חדש (למשל: ויזה 5808)"
                      style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 10, border: `1px solid ${COLORS.mist}`, fontSize: 16, padding: "0 10px", fontFamily: "inherit" }} />
                    <button disabled={!newCardName.trim()} onClick={() => { onSaveCards([...cards, { id: uid(), name: newCardName.trim(), billingDay: null, lag: null }]); setNewCardName(""); }}
                      style={{ minHeight: 40, padding: "0 14px", borderRadius: 10, border: "none", background: COLORS.sage, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: newCardName.trim() ? 1 : 0.5 }}>הוספה</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= ADVICE TAB ================= */
// ניתוחים בטעינה כרגע (לפי תקופה) - מונע לחיצה כפולה גם אחרי מעבר בין לשוניות
const ADVICE_INFLIGHT = {};
function periodLabel(p) {
  const m = /^(\d{4})-(\d{2})$/.exec(p || "");
  return m ? `${HEBREW_MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
}
function fmtDateTime(ts) {
  try { return new Date(ts).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return ""; }
}
function adviceFingerprint(payload) {
  const str = JSON.stringify(payload);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return String(h);
}
function AdviceTab({ monthDate, perCategory, totalBudget, totalSpent, fixedExpenses, advices, legacyAdvice, onSaved }) {
  const period = monthKey(monthDate);
  const label = periodLabel(period);
  const [req, setReq] = useState(null); // { period, status: "loading" | "error", error }
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // הנתונים שנשלחים לניתוח: נבנים מהנתונים שמוצגים במסך עבור החודש הנבחר בלבד
  const payload = useMemo(() => ({
    period,
    categories: perCategory.map(c => ({ name: c.name, budget: c.budget, spent: c.spent })),
    totalBudget, totalSpent,
    fixed: fixedExpenses.map(f => ({ name: f.name, amount: Number(f.amount) || 0, onCredit: !!f.onCredit, frequencyMonths: f.frequencyMonths || 1 })),
  }), [period, perCategory, totalBudget, totalSpent, fixedExpenses]);
  const fingerprint = useMemo(() => adviceFingerprint(payload), [payload]);

  const forPeriod = advices.filter(a => a.period === period).sort((x, y) => y.generatedAt - x.generatedAt);
  const current = forPeriod[0] || null;
  const history = [
    ...advices.filter(a => a !== current),
    ...(legacyAdvice && legacyAdvice.advice ? [{ legacy: true, advice: legacyAdvice.advice, generatedAt: legacyAdvice.generatedAt, period: null }] : []),
  ].sort((x, y) => (y.generatedAt || 0) - (x.generatedAt || 0));

  const loading = !!ADVICE_INFLIGHT[period] || (req && req.period === period && req.status === "loading");
  const error = req && req.period === period && req.status === "error" ? req.error : "";

  const getAdvice = async () => {
    if (ADVICE_INFLIGHT[period]) return;
    const reqPeriod = period, reqPayload = payload, reqFp = fingerprint;
    const now = new Date(), cur = monthKey(now);
    const dim = daysInMonth(monthDate);
    const daysPassed = reqPeriod < cur ? dim : reqPeriod === cur ? now.getDate() : 0;
    ADVICE_INFLIGHT[reqPeriod] = true;
    setReq({ period: reqPeriod, status: "loading" });
    try {
      const res = await fetch("/api/financial-advice", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Requested-With": "fb" },
        body: JSON.stringify({ ...reqPayload, daysPassed, daysInMonth: dim }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "שגיאה");
      if (json.period !== reqPeriod) throw new Error("השרת מחזיר ניתוח ללא תקופה מתאימה. יש להעלות את גרסת financial-advice.js העדכנית.");
      if (!json.advice) throw new Error("לא התקבלה תשובה מהמודל");
      // נשמר תמיד תחת התקופה שנשלחה, גם אם בינתיים עברו לחודש אחר
      await onSaved({ id: String(json.generatedAt || Date.now()), period: reqPeriod, generatedAt: json.generatedAt || Date.now(), advice: json.advice, fingerprint: reqFp });
      if (mounted.current) setReq(r => (r && r.period === reqPeriod ? null : r));
    } catch (e) {
      if (mounted.current) setReq({ period: reqPeriod, status: "error", error: e.message });
    } finally {
      delete ADVICE_INFLIGHT[reqPeriod];
    }
  };

  const btn = (text, primary) => (
    <button onClick={getAdvice} disabled={loading} style={{
      border: "none", background: primary ? COLORS.sage : COLORS.sageLight, color: primary ? "#fff" : COLORS.sage,
      padding: primary ? "12px 22px" : "9px 16px", borderRadius: primary ? 12 : 10, fontSize: primary ? 14 : 12.5, fontWeight: 700,
      cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, minHeight: 40
    }}>{loading ? "מנתח…" : text}</button>
  );
  const stale = current && current.fingerprint && current.fingerprint !== fingerprint;

  return (
    <div>
      <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 15, margin: "6px 2px 4px" }}>חוות דעת AI · {label}</div>
      <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 14 }}>ניתוח קצר של ההתנהלות הכלכלית בחודש הנבחר, מבוסס על הנתונים שלו. ניתוח נוצר רק בלחיצה על הכפתור.</div>

      {error && <div style={{ background: COLORS.coralLight, color: COLORS.coral, borderRadius: 12, padding: "10px 14px", fontSize: 12.5, marginBottom: 12, overflowWrap: "anywhere" }}>שגיאה ברענון הניתוח: {error}</div>}

      {!current ? (
        <div style={{ background: COLORS.card, borderRadius: 16, padding: 22, textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>💬</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>אין ניתוח לחודש {label}</div>
          <div style={{ color: COLORS.sub, fontSize: 12.5, marginBottom: 16 }}>לחץ כדי לקבל חוות דעת על התקציב וההוצאות של {label}</div>
          {btn("קבל ניתוח", true)}
        </div>
      ) : (
        <div style={{ background: COLORS.card, borderRadius: 16, padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 11.5, color: COLORS.sub, marginBottom: 10 }}>
            <span style={{ fontWeight: 700, color: COLORS.sage }}>תקופת הניתוח: {label}</span>
            <span>הופק: {fmtDateTime(current.generatedAt)}</span>
          </div>
          {stale && <div style={{ background: COLORS.amberLight, borderRadius: 10, padding: "8px 12px", fontSize: 12, marginBottom: 10 }}>⚠️ הנתונים השתנו מאז הניתוח</div>}
          <div style={{ fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{current.advice}</div>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>{btn("רענן ניתוח", false)}</div>
        </div>
      )}

      {history.length > 0 && (
        <details style={{ marginBottom: 14 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, padding: "8px 2px", color: COLORS.sub }}>ניתוחים קודמים ({history.length})</summary>
          {history.map((h, i) => (
            <div key={(h.id || "legacy") + i} style={{ background: COLORS.card, borderRadius: 14, padding: 14, marginTop: 8, opacity: 0.95 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 11.5, color: COLORS.sub, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: h.period ? COLORS.ink : COLORS.amber }}>{h.period ? `תקופת הניתוח: ${periodLabel(h.period)}` : "תקופת הניתוח אינה ידועה"}</span>
                {h.generatedAt ? <span>הופק: {fmtDateTime(h.generatedAt)}</span> : null}
                <span>· היסטורי, לא ייעוץ לחודש הפעיל{h.period === period ? " (גרסה קודמת)" : ""}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{h.advice}</div>
            </div>
          ))}
        </details>
      )}
      <div style={{ height: 70 }} />
    </div>
  );
}

function BudgetTab({ categories, monthBudgets, budgetInfo, onSetBudget, onAddCategory, onUpdateCategory, onRemoveCategory, onCopyPrev, cashInfo, onSetCashBudget, effectiveTotalBudget }) {
  const cashExplicit = cashInfo && cashInfo.explicit ? cashInfo.value : null;
  const cashEffective = cashInfo ? cashInfo.value : 0;
  // התקרה והתצוגה של החלוקה הן מול התקציב בפועל של החודש (כולל ירושה), כמו בתחזית - לא מול הרשומה הגולמית שיכולה להיות ריקה בחודש יורש.
  const cashCapTotal = Math.max(Number(effectiveTotalBudget) || 0, 0);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📦");
  const [editingId, setEditingId] = useState(null);
  const active = categories.filter(c => c.active !== false);
  const explicit = budgetInfo ? budgetInfo.explicit : true;
  const effectiveMap = budgetInfo ? budgetInfo.map : monthBudgets;
  const sourceLabel = !explicit && budgetInfo && budgetInfo.sourceKey ? monthLabelOf(budgetInfo.sourceKey) : null;
  const totalBudget = active.reduce((s, c) => s + (Number(effectiveMap[c.id]) || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 700, fontSize: 15 }}>ניהול תקציב חודשי</div>
        <button onClick={onCopyPrev} style={{ fontSize: 12, border: "none", background: COLORS.sageLight, color: COLORS.sage, padding: "6px 10px", borderRadius: 9, fontWeight: 600, cursor: "pointer" }}>⧉ העתק מחודש קודם</button>
      </div>
      <div style={{ background: COLORS.card, borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
        {active.map((c, i) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: i === active.length - 1 ? "none" : `1px solid ${COLORS.mist}` }}>
            <span style={{ fontSize: 18 }}>{c.icon}</span>
            {editingId === c.id ? (
              <input autoFocus defaultValue={c.name} onBlur={(e) => { onUpdateCategory(c.id, { name: e.target.value || c.name }); setEditingId(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} style={{ flex: 1, padding: "5px 8px", borderRadius: 7, border: `1px solid ${COLORS.mist}`, fontSize: 13 }} />
            ) : (
              <span onClick={() => setEditingId(c.id)} style={{ flex: 1, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>{c.name}</span>
            )}
            <input key={c.id + "-" + (explicit ? "exp" : "inh")} type="number" placeholder={explicit ? "0" : String(Number(effectiveMap[c.id]) || 0)} defaultValue={explicit ? (monthBudgets[c.id] || "") : ""} onBlur={(e) => {
              const raw = e.target.value.trim();
              // מיקוד ויציאה בלי הקלדה לא שומרים: בחודש יורש נשמרת הירושה, ובחודש מפורש נשמר הערך הקיים.
              // הקלדת ערך (כולל 0 מפורש) נשמרת כרגיל; ניקוי ערך קיים בחודש מפורש שומר 0 כמו קודם.
              if (raw === "") { if (explicit && monthBudgets[c.id] !== undefined) onSetBudget(c.id, 0); return; }
              const v = Number(raw);
              if (!Number.isFinite(v)) return;
              if (explicit && monthBudgets[c.id] !== undefined && v === Number(monthBudgets[c.id])) return;
              onSetBudget(c.id, v);
            }}
              style={{ width: 82, padding: "7px 8px", borderRadius: 8, border: `1px solid ${COLORS.mist}`, fontSize: 13, textAlign: "center" }} />
            <span style={{ fontSize: 11.5, color: COLORS.sub }}>₪</span>
            <button onClick={() => onRemoveCategory(c.id)} style={{ ...iconBtnStyle, color: COLORS.coral }}>🗑</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px 14px", fontSize: 13.5 }}>
        <span style={{ color: COLORS.sub }}>סה"כ תקציב חודשי</span>
        <span style={{ fontWeight: 800, fontFamily: "Heebo, sans-serif" }}>{fmt(totalBudget)}</span>
      </div>
      {sourceLabel && (
        <div style={{ fontSize: 11.5, color: COLORS.sub, padding: "0 4px 14px", marginTop: -8, lineHeight: 1.5 }}>החלוקה נמשכת אוטומטית מ{sourceLabel}. שינוי ערך מעתיק את כל החלוקה לחודש זה ומחיל את השינוי עליו בלבד.</div>
      )}
      <div style={{ background: COLORS.card, borderRadius: 16, padding: "12px 14px", marginBottom: 14 }}>
        <label style={labelStyle}>חלוקת התקציב לפי אמצעי תשלום</label>
        {sourceLabel && (
          <div style={{ fontSize: 11.5, color: COLORS.sub, marginBottom: 8, lineHeight: 1.5 }}>
            החלוקה מחושבת מול התקציב שנמשך מ{sourceLabel}: <b>{fmt(cashCapTotal)}</b>.
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13 }}>מזומן / ביט מהבנק (יורד באותו חודש):</span>
          <input key={"cash-" + (cashExplicit !== null ? cashExplicit : "inh" + cashEffective)} type="number" inputMode="decimal" min="0"
            placeholder={cashExplicit === null && cashEffective > 0 ? String(cashEffective) : "0"} defaultValue={cashExplicit !== null ? cashExplicit : ""}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              if (raw === "") { onSetCashBudget(null); return; }
              let v = Number(raw);
              if (!Number.isFinite(v) || v < 0) v = 0;
              if (v > cashCapTotal) v = cashCapTotal;
              e.target.value = String(v);
              onSetCashBudget(v);
            }}
            style={{ width: 90, padding: "7px 8px", borderRadius: 8, border: `1px solid ${COLORS.mist}`, fontSize: 13, textAlign: "center" }} />
          <span style={{ fontSize: 11.5, color: COLORS.sub }}>₪</span>
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.sub, marginTop: 8, lineHeight: 1.6 }}>
          {Math.min(cashEffective, cashCapTotal) > 0
            ? <span>אשראי (יורד בחיוב האשראי): <b>{fmt(cashCapTotal - Math.min(cashEffective, cashCapTotal))}</b> · מזומן/ביט: <b>{fmt(Math.min(cashEffective, cashCapTotal))}</b></span>
            : "כרגע כל התקציב מחושב כאשראי (יורד בחיוב האשראי)."}
          {cashExplicit === null && cashInfo && cashInfo.sourceKey && cashEffective > 0 && (
            <span><br />החלוקה נמשכת אוטומטית מ{monthLabelOf(cashInfo.sourceKey)}. שינוי או איפוס כאן יחולו על החודש המוצג בלבד.</span>
          )}
          <br />
          ביט בטעינת אשראי יורד בחיוב האשראי, ולכן נספר בחלק האשראי. הסכום לא יכול לעבור את סך התקציב החודשי.
          <br />
          חודש ללא חלוקה מוגדרת יורש את החלוקה האחרונה שהוגדרה לפניו. אפשר לשנות לחודש מסוים בלבד, והזנת 0 מחשבת אותו כאשראי במלואו.
        </div>
      </div>
      {!adding ? (
        <button onClick={() => setAdding(true)} style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1.5px dashed ${COLORS.sage}`, background: "none", color: COLORS.sage, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>＋ הוספת קטגוריה</button>
      ) : (
        <div style={{ background: COLORS.card, borderRadius: 16, padding: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {ICON_OPTIONS.map(ic => (
              <button key={ic} onClick={() => setNewIcon(ic)} style={{ fontSize: 17, width: 34, height: 34, borderRadius: 9, border: `2px solid ${newIcon === ic ? COLORS.sage : COLORS.mist}`, background: newIcon === ic ? COLORS.sageLight : "#fff", cursor: "pointer" }}>{ic}</button>
            ))}
          </div>
          <input placeholder="שם הקטגוריה" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.mist}`, fontSize: 13.5, marginBottom: 10, boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setAdding(false); setNewName(""); }} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "#fff", cursor: "pointer", fontSize: 13 }}>ביטול</button>
            <button disabled={!newName.trim()} onClick={() => { onAddCategory(newName.trim(), newIcon); setNewName(""); setAdding(false); }} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: COLORS.sage, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>שמירה</button>
          </div>
        </div>
      )}
      <div style={{ height: 20 }} />
    </div>
  );
}

/* ================= EXPENSE MODAL ================= */
function ExpenseModal({ categories, user, initial, onClose, onSave, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? "");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [who, setWho] = useState(initial?.user ?? user);
  const canSave = Number(amount) > 0 && categoryId && /^\d{4}-\d{2}-\d{2}$/.test(date || "");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,33,61,0.4)", zIndex: 60, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", borderRadius: "20px 20px 0 0", padding: "18px 18px 26px", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "Heebo, sans-serif", fontWeight: 800, fontSize: 18 }}>{initial ? "עריכת הוצאה" : "הוצאה חדשה"}</div>
          <button onClick={onClose} aria-label="סגירת עריכת הוצאה" style={{ ...iconBtnStyle, width: 44, height: 44 }}>✕</button>
        </div>
        <label style={labelStyle}>סכום</label>
        <input autoFocus type="number" inputMode="decimal" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)}
          style={{ width: "100%", padding: "14px", borderRadius: 12, border: `1.5px solid ${COLORS.mist}`, fontSize: 22, fontWeight: 700, textAlign: "center", marginBottom: 14, boxSizing: "border-box" }} />
        <label style={labelStyle}>קטגוריה</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
          {categories.map(c => (
            <button key={c.id} onClick={() => setCategoryId(c.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 999, border: `1.5px solid ${categoryId === c.id ? COLORS.sage : COLORS.mist}`, background: categoryId === c.id ? COLORS.sageLight : "#fff", fontSize: 12.5, cursor: "pointer", fontWeight: 600 }}>
              <span>{c.icon}</span>{c.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>תאריך</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>מי ביצע</label><input value={who} onChange={e => setWho(e.target.value)} style={inputStyle} /></div>
        </div>
        <label style={labelStyle}>תיאור / הערה</label>
        <input placeholder="למשל: קניות שבועיות" value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, marginBottom: 20 }} />
        <button disabled={!canSave} onClick={() => onSave({ id: initial?.id, amount: Number(amount), categoryId, date, description, user: who })}
          style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: canSave ? COLORS.sage : COLORS.mist, color: "#fff", fontWeight: 800, fontSize: 15, cursor: canSave ? "pointer" : "default" }}>שמירה</button>
        {initial && onDelete && <div style={{ marginTop: 14 }}>
          {!confirmDelete ? <button onClick={() => setConfirmDelete(true)} style={{ width: "100%", minHeight: 44, border: "none", borderRadius: 10, background: COLORS.paper, color: COLORS.coral, fontFamily: "inherit", fontSize: 14 }}>מחיקת ההוצאה</button> : <div style={{ background: COLORS.paper, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 14, marginBottom: 10 }}>למחוק את "{initial.description || categoryOf(categories, initial.categoryId).name}" ({fmt(initial.amount)})?</div>
            <div style={{ display: "flex", gap: 8 }}><button onClick={() => setConfirmDelete(false)} style={{ flex: 1, minHeight: 44, borderRadius: 10, border: `1px solid ${COLORS.mist}`, background: "white", fontFamily: "inherit" }}>ביטול</button><button onClick={() => onDelete(initial.id)} style={{ flex: 1, minHeight: 44, borderRadius: 10, border: "none", color: "white", background: COLORS.coral, fontFamily: "inherit" }}>אישור מחיקה</button></div>
          </div>}
        </div>}
      </div>
    </div>
  );
}
const labelStyle = { fontSize: 12, color: COLORS.sub, fontWeight: 600, marginBottom: 6, display: "block" };
const inputStyle = { width: "100%", padding: "11px 12px", borderRadius: 10, border: `1.5px solid ${COLORS.mist}`, fontSize: 13.5, boxSizing: "border-box" };

ReactDOM.createRoot(document.getElementById("root")).render(<BudgetApp />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
