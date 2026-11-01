const {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef
} = React;

/* ---------- design tokens ---------- */
const COLORS = {
  ink: "#14213D",
  paper: "#F3F6F4",
  card: "#FFFFFF",
  sage: "#2F6F5E",
  sageLight: "#E4F0EC",
  amber: "#E3A008",
  amberLight: "#FBF0D6",
  coral: "#E4572E",
  coralLight: "#FBE2DA",
  mist: "#E1E8E4",
  sub: "#6B7A75"
};
const DEFAULT_CATEGORIES = [{
  id: "c1",
  name: "סופר ומזון",
  icon: "🛒",
  active: true
}, {
  id: "c2",
  name: "מסעדות ואוכל בחוץ",
  icon: "🍽️",
  active: true
}, {
  id: "c3",
  name: "בילויים",
  icon: "🎉",
  active: true
}, {
  id: "c4",
  name: "קניות",
  icon: "🛍️",
  active: true
}, {
  id: "c5",
  name: "דלק",
  icon: "⛽",
  active: true
}, {
  id: "c6",
  name: "רכב",
  icon: "🚗",
  active: true
}, {
  id: "c7",
  name: "ילדים",
  icon: "🧸",
  active: true
}, {
  id: "c8",
  name: "בית",
  icon: "🏠",
  active: true
}, {
  id: "c9",
  name: "פארם",
  icon: "💊",
  active: true
}, {
  id: "c10",
  name: "בגדים",
  icon: "👕",
  active: true
}, {
  id: "c11",
  name: "שונות",
  icon: "📦",
  active: true
}];
const ICON_OPTIONS = ["🛒", "🍽️", "🎉", "🛍️", "⛽", "🚗", "🧸", "🏠", "💊", "👕", "📦", "💡", "📱", "🎓", "✈️", "🐾", "🎁", "☕", "🏋️", "💇"];
const HEBREW_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const APP_VERSION = "37";
const APP_VERSION_DATE = "1.11.2026";
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
function fmt(n) {
  const v = Math.round(Number(n) || 0);
  return `${v.toLocaleString("he-IL")} ₪`;
}
function pct(spent, budget) {
  if (!budget || budget <= 0) return spent > 0 ? 999 : 0;
  return spent / budget * 100;
}
function statusColor(p) {
  if (p >= 90) return COLORS.coral;
  if (p >= 70) return COLORS.amber;
  return COLORS.sage;
}

/* ---------- התראות תקציב (השוואה באגורות, לפי הדיוק הכספי של המערכת) ---------- */
const NEAR_BUDGET_PCT = 80; // סף ההתקרבות הקיים
const toAgorot = v => Math.round((Number(v) || 0) * 100); // מנרמל שגיאות נקודה צפה (0.1+0.2) בלי לשנות את הסכום השמור
const round2 = v => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
}; // סכומים נשמרים מעוגלים לשתי ספרות (אגורות), בלי שאריות נקודה צפה
function fmtAgorot(ag) {
  if (ag > 0 && ag < 100) return "פחות מ־1 ₪";
  return `${(ag / 100).toLocaleString("he-IL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })} ₪`;
}
function categoryBudgetState(budget, spent) {
  const b = toAgorot(budget),
    sp = toAgorot(spent);
  if (b <= 0) return {
    state: "none",
    diffAg: 0
  };
  const diff = sp - b;
  if (diff > 0) return {
    state: "over",
    diffAg: diff
  };
  if (diff === 0) return {
    state: "full",
    diffAg: 0
  };
  if (sp / b * 100 >= NEAR_BUDGET_PCT) return {
    state: "near",
    diffAg: diff,
    pct: sp / b * 100
  };
  return {
    state: "ok",
    diffAg: diff
  };
}
function buildBudgetAlerts(perCategory, paceHigh, projected) {
  const over = [],
    near = [],
    full = [];
  perCategory.forEach(c => {
    const r = categoryBudgetState(c.budget, c.spent);
    if (r.state === "over") over.push({
      kind: "over",
      key: c.id,
      w: r.diffAg,
      text: `${c.icon} ${c.name} — חריגה של ${r.diffAg < 100 ? "פחות מ־1 ₪" : fmtAgorot(r.diffAg)}`
    });else if (r.state === "near") near.push({
      kind: "near",
      key: c.id,
      w: r.pct,
      text: `${c.icon} ${c.name} — מתקרב לתקציב, נותרו ${fmtAgorot(-r.diffAg)}`
    });else if (r.state === "full") full.push({
      kind: "full",
      key: c.id,
      w: 0,
      text: `${c.icon} ${c.name} — התקציב נוצל במלואו`
    });
  });
  over.sort((x, y) => y.w - x.w);
  near.sort((x, y) => y.w - x.w);
  const pace = paceHigh ? [{
    kind: "pace",
    key: "pace",
    text: `קצב ההוצאות הכללי גבוה — צפי לסיים בכ־${fmt(projected)}`
  }] : [];
  return [...over, ...pace, ...near, ...full];
}

/* ---------- storage helpers (server API) ---------- */
const EMPTY_DATA = {
  categories: DEFAULT_CATEGORIES,
  budgets: {},
  expenses: [],
  fixedExpenses: [],
  incomeEntries: [],
  recurringIncomes: [],
  plannedExpenses: [],
  settings: {
    creditLag: false,
    openingBalance: 0,
    openingBalanceDate: "",
    creditBillingDay: 1,
    variableOverrides: {},
    variableOverrideMeta: {},
    cashBudgets: {},
    lastAdvice: null,
    advices: [],
    cards: []
  }
};
function normalizeData(d) {
  // נירמול שאריות נקודה צפה שנשמרו בעבר (למשל 11,378.380000000001) לשתי ספרות אחרי הנקודה.
  const moneyList = (arr, keys) => (arr || []).map(x => {
    if (!x || typeof x !== "object") return x;
    const y = {
      ...x
    };
    keys.forEach(k => {
      if (k in y && y[k] != null && y[k] !== "") y[k] = round2(y[k]);
    });
    return y;
  });
  const moneyMapVals = obj => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, typeof v === "number" ? round2(v) : v]));
  const moneyBudgets = obj => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, v && typeof v === "object" ? moneyMapVals(v) : v]));
  const s = d.settings || {};
  return {
    categories: d.categories || DEFAULT_CATEGORIES,
    budgets: moneyBudgets(d.budgets),
    expenses: moneyList(d.expenses, ["amount"]),
    fixedExpenses: moneyList(d.fixedExpenses, ["amount"]),
    incomeEntries: moneyList(d.incomeEntries, ["amount"]),
    recurringIncomes: moneyList(d.recurringIncomes, ["amount", "bonusAmount"]),
    plannedExpenses: moneyList(d.plannedExpenses, ["amount"]),
    settings: {
      creditLag: false,
      openingBalance: 0,
      openingBalanceDate: "",
      creditBillingDay: 1,
      variableOverrides: {},
      variableOverrideMeta: {},
      cashBudgets: {},
      lastAdvice: null,
      advices: [],
      cards: [],
      ...s,
      openingBalance: round2(s.openingBalance),
      variableOverrides: moneyMapVals(s.variableOverrides),
      cashBudgets: moneyMapVals(s.cashBudgets)
    }
  };
}
// החלוקה בפועל לקטגוריות לחודש: חודש ללא רשומה מוגדרת משלו יורש את החלוקה האחרונה שהוגדרה לפניו,
// ולא את חלוקת החודש הנצפה, כדי שהמסכים לא ישתנו ממעבר בין חודשים. לא יורשים אחורה מחודש עתידי.
// רשומה "מוגדרת" היא רשומה עם ערכים בפועל: אובייקט ריק ({}) מדלגים עליה, ורשומה עם ערכים שהסכום שלהם 0
// היא תקציב אפס מכוון ונכבדת כפי שהיא. מחזיר { map, sourceKey, explicit }.
function budgetsForMonth(budgets, mKey) {
  const b = budgets || {};
  const defined = k => {
    const r = b[k];
    return !!r && Object.keys(r).length > 0;
  };
  if (defined(mKey)) return {
    map: b[mKey],
    sourceKey: null,
    explicit: true
  };
  const [y0, m0] = mKey.split("-").map(Number);
  for (let i = 1; i <= 240; i++) {
    const k = monthKey(new Date(y0, m0 - 1 - i, 1));
    if (defined(k)) return {
      map: b[k],
      sourceKey: k,
      explicit: false
    };
  }
  // לא נמצא תקציב מוגדר באף חודש קודם: רשומה ריקה באופן קבוע, לעולם לא החלוקה של החודש הנצפה.
  return {
    map: {},
    sourceKey: null,
    explicit: false
  };
}
function budgetTotalForMonth(budgets, categories, mKey) {
  const {
    map
  } = budgetsForMonth(budgets, mKey);
  return categories.reduce((s, c) => s + (Number(map[c.id]) || 0), 0);
}
// חלוקת מזומן/ביט לחודש: חודש ללא חלוקה מוגדרת יורש את החלוקה האחרונה שהוגדרה לפניו,
// כפי שהתקציב הכולל יורש. ערך 0 מפורש נכבד כפי שהוא (הכול אשראי באותו חודש) וחוסם את הירושה.
// מחזיר { value, sourceKey, explicit }: sourceKey הוא החודש שממנו נורש הערך, explicit כשהוגדר לחודש עצמו.
function cashBudgetForMonth(cashBudgets, mKey) {
  const cb = cashBudgets || {};
  const def = k => Object.prototype.hasOwnProperty.call(cb, k) && Number.isFinite(Number(cb[k])) && Number(cb[k]) >= 0;
  if (def(mKey)) return {
    value: Number(cb[mKey]),
    sourceKey: null,
    explicit: true
  };
  const [y0, m0] = mKey.split("-").map(Number);
  for (let i = 1; i <= 240; i++) {
    const k = monthKey(new Date(y0, m0 - 1 - i, 1));
    if (def(k)) return {
      value: Number(cb[k]),
      sourceKey: k,
      explicit: false
    };
  }
  return {
    value: 0,
    sourceKey: null,
    explicit: false
  };
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
  return (diff % freq + freq) % freq === 0;
}
function fixedFreqLabel(freq) {
  const n = freq || 1;
  return n === 1 ? "חודשי" : n === 2 ? "דו-חודשי" : n === 12 ? "שנתי" : `כל ${n} חודשים`;
}
// בדיקת חפיפה בין תקופות של אותה הוצאה (אותו seriesId). גבול ריק = אינסוף.
function periodsOverlap(aFrom, aTo, bFrom, bTo) {
  const lo = x => MONTH_RE.test(x || "") ? x : "0000-00";
  const hi = x => MONTH_RE.test(x || "") ? x : "9999-99";
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
  return {
    direct,
    creditFromPrev
  };
}

/* ---------- כרטיסי אשראי (תוספתי: settings.cards, fixedExpenses[].cardId אופציונלי) ---------- */
function shiftMonthKey(mKey, delta) {
  const [y, m] = mKey.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
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
const sumAmt = items => items.reduce((t, f) => t + (Number(f.amount) || 0), 0);
// הוצאות קבועות באשראי המשויכות לכרטיס, לחודש תחזית mKey.
// scheduled: כרטיס מוגדר במלואו - ההוצאות של חודש (mKey - lag) יורדות ביום החיוב של הכרטיס ב-mKey.
// unscheduled: חסרה הגדרה (או כרטיס לא קיים) - הסכום הידוע של הוצאות חודש mKey, ללא תזמון וללא ניחוש.
function cardForecastForMonth(fixedExpenses, cards, mKey) {
  const list = cards || [];
  const cardItems = fixedExpenses.filter(f => f.active !== false && f.onCredit && f.cardId);
  const ids = [];
  cardItems.forEach(f => {
    if (!ids.includes(f.cardId)) ids.push(f.cardId);
  });
  const scheduled = [],
    unscheduled = [];
  ids.forEach(id => {
    const card = list.find(c => c.id === id);
    if (isCardComplete(card)) {
      const items = cardItems.filter(f => f.cardId === id && isFixedApplicable(f, shiftMonthKey(mKey, -card.lag)));
      if (items.length) scheduled.push({
        card,
        items,
        total: sumAmt(items),
        day: card.billingDay
      });
    } else {
      const items = cardItems.filter(f => f.cardId === id && isFixedApplicable(f, mKey));
      if (items.length) unscheduled.push({
        cardId: id,
        name: card ? card.name || "כרטיס ללא שם" : "כרטיס לא מוכר",
        why: cardMissingSettings(card),
        items,
        total: sumAmt(items)
      });
    }
  });
  return {
    scheduled,
    unscheduled
  };
}

/* ---------- הכנסות קבועות (תוספתי: recurringIncomes, incomeEntries[].recurringIncomeId אופציונלי) ---------- */
const isEmptyVal = v => v === "" || v === null || v === undefined;
function daysInMonthKey(mKey) {
  const [y, m] = mKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
// הכנסה קבועה חלה בחודש אם הוא בתוך [startMonth, endMonth] (קצוות כלולים). בחודש בונוס bonusAmount מחליף את הסכום הרגיל במלואו.
// חודש בונוס = חודש העוגן עצמו ואז כל N חודשים אחריו, אף פעם לא לפניו (בדומה ל-anchorMonth בהוצאות קבועות).
function recurringIncomeForMonth(r, mKey) {
  if (!MONTH_RE.test(r.startMonth || "") || mKey < r.startMonth) return null;
  if (MONTH_RE.test(r.endMonth || "") && mKey > r.endMonth) return null;
  let amount = Number(r.amount) || 0,
    bonus = false;
  const n = Number(r.bonusEveryMonths);
  if (!isEmptyVal(r.bonusAmount) && Number.isInteger(n) && n >= 1 && MONTH_RE.test(r.bonusAnchorMonth || "") && mKey >= r.bonusAnchorMonth && monthsDiff(r.bonusAnchorMonth, mKey) % n === 0) {
    amount = Number(r.bonusAmount) || 0;
    bonus = true;
  }
  return {
    amount,
    bonus,
    day: Math.min(Math.max(Math.floor(Number(r.day)) || 1, 1), daysInMonthKey(mKey))
  };
}
// הקישור הוא לפי recurringIncomeId בלבד. רשומה ידנית מקושרת באותו חודש מחליפה את הקבועה (גם בסכום 0) ולכן הקבועה לא נספרת שוב.
function recurringIncomeItemsForMonth(recurringIncomes, incomeEntries, mKey) {
  const items = [],
    overridden = [];
  (recurringIncomes || []).forEach(r => {
    const calc = recurringIncomeForMonth(r, mKey);
    if (!calc) return;
    const ov = incomeEntries.find(e => e.recurringIncomeId === r.id && e.monthKey === mKey);
    if (ov) overridden.push({
      r,
      entry: ov,
      calc
    });else items.push({
      r,
      ...calc
    });
  });
  return {
    items,
    overridden
  };
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
    const b = Number(x.bonusAmount),
      n = Number(x.bonusEveryMonths);
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
const API_GET = {
  credentials: "same-origin",
  headers: {
    "X-Requested-With": "fb"
  }
};
async function loadAppData() {
  try {
    const res = await fetch("/api/data", API_GET);
    if (res.status === 401) return {
      status: "unauthorized"
    };
    if (!res.ok) return {
      status: "error"
    };
    const json = await res.json();
    DATA_VERSION = json.version || 0;
    return {
      status: "ok",
      data: json.data ? normalizeData(json.data) : EMPTY_DATA
    };
  } catch (e) {
    console.error(e);
    return {
      status: "error"
    };
  }
}
async function saveAppData(data) {
  try {
    const res = await fetch("/api/data", {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fb"
      },
      body: JSON.stringify({
        baseVersion: DATA_VERSION,
        data
      })
    });
    if (res.ok) {
      DATA_VERSION = (await res.json()).version;
      return "ok";
    }
    if (res.status === 409) return "conflict";
    if (res.status === 401) return "unauthorized";
    if (res.status === 429) return "rate";
    return "error";
  } catch (e) {
    console.error(e);
    return "error";
  }
}
async function loginRequest(passcode) {
  const res = await fetch("/api/login", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fb"
    },
    body: JSON.stringify({
      passcode
    })
  });
  return {
    ok: res.ok,
    status: res.status
  };
}
async function logoutRequest() {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "fb"
      }
    });
  } catch (e) {}
  location.reload();
}

/* ---------- small UI atoms ---------- */
function RingGauge({
  percent,
  size = 108,
  stroke = 11,
  color
}) {
  const clamped = Math.min(percent, 100);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - clamped / 100 * c;
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      transform: "rotate(-90deg)"
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    stroke: COLORS.mist,
    strokeWidth: stroke,
    fill: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    stroke: color,
    strokeWidth: stroke,
    fill: "none",
    strokeDasharray: c,
    strokeDashoffset: offset,
    strokeLinecap: "round",
    style: {
      transition: "stroke-dashoffset 0.6s ease"
    }
  }));
}
function ProgressBar({
  percent,
  color
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      borderRadius: 999,
      background: COLORS.mist,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${Math.min(percent, 100)}%`,
      background: color,
      borderRadius: 999,
      transition: "width 0.5s ease"
    }
  }));
}
/* simple dependency-free charts */
function BudgetVsActualChart({
  data
}) {
  const max = Math.max(1, ...data.map(d => Math.max(d.budget, d.spent)));
  return /*#__PURE__*/React.createElement("div", null, data.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      marginBottom: 3
    }
  }, d.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 8,
      background: COLORS.mist,
      borderRadius: 999,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${d.budget / max * 100}%`,
      height: "100%",
      background: COLORS.mist2 || "#B9C6C0",
      borderRadius: 999
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: COLORS.sub,
      width: 54,
      textAlign: "left"
    }
  }, fmt(d.budget))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 8,
      background: COLORS.mist,
      borderRadius: 999,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${d.spent / max * 100}%`,
      height: "100%",
      background: COLORS.sage,
      borderRadius: 999
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: COLORS.ink,
      width: 54,
      textAlign: "left",
      fontWeight: 700
    }
  }, fmt(d.spent))))));
}
const PIE_COLORS = [COLORS.sage, COLORS.amber, COLORS.coral, "#4A90A4", "#8E7CC3", "#D4A373", "#6B9080", "#C9184A", "#457B9D", "#B08968", "#588157"];
function DonutChart({
  data
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const stops = data.map((d, i) => {
    const start = acc / total * 360;
    acc += d.value;
    const end = acc / total * 360;
    return `${PIE_COLORS[i % PIE_COLORS.length]} ${start}deg ${end}deg`;
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 160,
      height: 160,
      borderRadius: "50%",
      background: `conic-gradient(${stops.join(",")})`,
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 30,
      borderRadius: "50%",
      background: COLORS.card
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "center",
      marginTop: 12
    }
  }, data.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      color: COLORS.sub
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 999,
      background: PIE_COLORS[i % PIE_COLORS.length]
    }
  }), d.name))));
}
function CumulativeLineChart({
  points,
  budget
}) {
  if (points.length < 2) return null;
  const w = 300,
    h = 130,
    pad = 8;
  const maxY = Math.max(budget || 0, ...points.map(p => p.spent), 1);
  const stepX = (w - pad * 2) / (points.length - 1);
  const toXY = (p, i) => [pad + i * stepX, h - pad - p.spent / maxY * (h - pad * 2)];
  const path = points.map((p, i) => toXY(p, i)).map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const budgetY = h - pad - (budget || 0) / maxY * (h - pad * 2);
  return /*#__PURE__*/React.createElement("svg", {
    width: "100%",
    viewBox: `0 0 ${w} ${h}`,
    style: {
      display: "block"
    }
  }, budget > 0 && /*#__PURE__*/React.createElement("line", {
    x1: pad,
    y1: budgetY,
    x2: w - pad,
    y2: budgetY,
    stroke: COLORS.coral,
    strokeDasharray: "4 4",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: path,
    fill: "none",
    stroke: COLORS.sage,
    strokeWidth: "2.5"
  }));
}

/* ================= LOGIN SCREEN ================= */
function LoginScreen({
  onLoggedIn
}) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async e => {
    e.preventDefault();
    if (!pass || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await loginRequest(pass);
      if (r.ok) {
        setPass("");
        onLoggedIn();
        return;
      }
      setErr(r.status === 429 ? "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות." : r.status === 503 ? "הכניסה עדיין לא הוגדרה בשרת." : "קוד שגוי");
    } catch (e2) {
      setErr("אין חיבור לשרת. נסו שוב.");
    }
    setBusy(false);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: COLORS.paper,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: submit,
    style: {
      background: COLORS.card,
      borderRadius: 20,
      padding: 26,
      width: "100%",
      maxWidth: 380,
      boxShadow: "0 8px 30px rgba(20,33,61,0.08)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 800,
      fontSize: 20,
      color: COLORS.ink,
      marginBottom: 6
    }
  }, "כניסה"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: COLORS.sub,
      fontSize: 13.5,
      marginBottom: 16
    }
  }, "הזינו את קוד הכניסה המשפחתי."), /*#__PURE__*/React.createElement("input", {
    type: "password",
    autoComplete: "current-password",
    "aria-label": "קוד כניסה",
    value: pass,
    onChange: e => setPass(e.target.value),
    style: {
      width: "100%",
      height: 46,
      borderRadius: 12,
      border: `1.5px solid ${COLORS.mist}`,
      padding: "0 12px",
      fontSize: 16,
      marginBottom: 12
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    disabled: busy || !pass,
    style: {
      width: "100%",
      padding: 14,
      borderRadius: 12,
      border: "none",
      background: COLORS.sage,
      color: "#fff",
      fontWeight: 800,
      fontSize: 15,
      opacity: busy || !pass ? 0.6 : 1
    }
  }, busy ? "בודק…" : "כניסה"), err && /*#__PURE__*/React.createElement("div", {
    role: "alert",
    style: {
      marginTop: 12,
      fontSize: 13,
      color: COLORS.coral
    }
  }, err)));
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
    if (r.status === "ok") {
      setData(r.data);
      setAuthState("ready");
    } else setAuthState(r.status === "unauthorized" ? "login" : "error");
    setLoading(false);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  const persist = useCallback(async next => {
    const prev = dataRef.current;
    setData(next);
    const r = await saveAppData(next);
    if (r === "ok") return true;
    if (r === "conflict") {
      showToast("הנתונים עודכנו ממכשיר אחר. טוען מחדש, נסו שוב.");
      await reload();
    } else if (r === "unauthorized") {
      setAuthState("login");
    } else if (r === "rate") {
      setData(prev);
      showToast("הגעתם למגבלת השמירות. נסו שוב מאוחר יותר.");
    } else {
      setData(prev);
      showToast("השמירה נכשלה. השינוי לא נשמר, נסו שוב.");
    }
    return false;
  }, [reload]);
  const showToast = msg => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };
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
  const timePct = daysPassed / dim * 100;
  const projected = daysPassed > 0 ? totalSpent / daysPassed * dim : 0;
  const paceHigh = totalBudget > 0 && overallPct - timePct > 12 && isCurrentMonth;
  const perCategory = useMemo(() => activeCategories.map(c => {
    const budget = Number(effectiveBudgets[c.id]) || 0;
    const spent = monthExpenses.filter(e => e.categoryId === c.id).reduce((s, e) => s + Number(e.amount || 0), 0);
    return {
      ...c,
      budget,
      spent,
      percent: pct(spent, budget),
      remaining: budget - spent
    };
  }), [activeCategories, effectiveBudgets, monthExpenses]);
  const alerts = useMemo(() => buildBudgetAlerts(perCategory, paceHigh, projected), [perCategory, paceHigh, projected]);
  const changeMonth = delta => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  const copyPrevBudget = async () => {
    const prev = new Date(monthDate);
    prev.setMonth(prev.getMonth() - 1);
    // החודש הקודם עצמו יכול לרשת תקציב מחודש מוקדם יותר - מעתיקים את החלוקה האפקטיבית שלו, לא רק רשומה מפורשת
    const prevInfo = budgetsForMonth(data.budgets, monthKey(prev));
    const prevBudget = prevInfo.map;
    if (!prevBudget || Object.keys(prevBudget).length === 0) {
      showToast("אין תקציב לחודש הקודם");
      return;
    }
    if (await persist({
      ...data,
      budgets: {
        ...data.budgets,
        [mKey]: {
          ...prevBudget
        }
      }
    })) showToast("התקציב הועתק מהחודש הקודם");
  };
  const setCategoryBudget = async (catId, amount) => {
    // עריכה ראשונה בחודש יורש: מממשים את החלוקה שנמשכה כבסיס, כדי ששינוי קטגוריה אחת לא יאפס את האחרות.
    const base = budgetInfo.explicit ? data.budgets[mKey] || {} : effectiveBudgets;
    await persist({
      ...data,
      budgets: {
        ...data.budgets,
        [mKey]: {
          ...base,
          [catId]: round2(amount)
        }
      }
    });
  };
  const addCategory = async (name, icon) => {
    await persist({
      ...data,
      categories: [...data.categories, {
        id: uid(),
        name,
        icon,
        active: true
      }]
    });
  };
  const updateCategory = async (id, patch) => {
    await persist({
      ...data,
      categories: data.categories.map(c => c.id === id ? {
        ...c,
        ...patch
      } : c)
    });
  };
  const removeCategory = async id => {
    await persist({
      ...data,
      categories: data.categories.map(c => c.id === id ? {
        ...c,
        active: false
      } : c)
    });
  };
  const saveExpense = async exp => {
    const clean = {
      ...exp,
      amount: round2(exp.amount)
    };
    const next = clean.id ? {
      ...data,
      expenses: data.expenses.map(e => e.id === clean.id ? clean : e)
    } : {
      ...data,
      expenses: [...data.expenses, {
        ...clean,
        id: uid(),
        createdAt: Date.now()
      }]
    };
    if (!(await persist(next))) return;
    setShowAddExpense(false);
    setEditExpense(null);
    showToast("ההוצאה נשמרה");
  };
  const restoreBackup = async file => {
    let obj;
    try {
      obj = JSON.parse(await file.text());
    } catch {
      showToast("הקובץ אינו גיבוי תקין");
      return;
    }
    if (!obj || !Array.isArray(obj.categories) || !Array.isArray(obj.expenses) || !Array.isArray(obj.fixedExpenses)) {
      showToast("הקובץ אינו גיבוי תקין");
      return;
    }
    setPendingRestore(obj);
  };
  const confirmRestore = async () => {
    const obj = pendingRestore;
    setPendingRestore(null);
    if (obj && (await persist(obj))) {
      await reload();
      showToast("הנתונים שוחזרו מהגיבוי");
    }
  };
  const deleteExpense = async id => {
    const saved = await persist({
      ...data,
      expenses: data.expenses.filter(e => e.id !== id)
    });
    if (saved) showToast("ההוצאה נמחקה");
    return saved;
  };
  const addFixedExpense = async (name, amount, dueDay, frequencyMonths, anchorMonth, effectiveFrom, effectiveTo, onCredit, cardId) => {
    const period = {};
    if (onCredit) {
      period.onCredit = true;
      if (cardId) period.cardId = cardId;
    }
    if (effectiveFrom) period.effectiveFrom = effectiveFrom;
    if (effectiveTo) period.effectiveTo = effectiveTo;
    await persist({
      ...data,
      fixedExpenses: [...data.fixedExpenses, {
        id: uid(),
        name,
        amount: round2(amount),
        dueDay,
        frequencyMonths: frequencyMonths || 1,
        anchorMonth: anchorMonth || monthKey(new Date()),
        active: true,
        ...period
      }]
    });
  };
  const updateFixedExpense = async (id, patch) => {
    await persist({
      ...data,
      fixedExpenses: data.fixedExpenses.map(f => f.id === id ? {
        ...f,
        ...patch
      } : f)
    });
  };
  // שינוי סכום החל מחודש: ההגדרה הקיימת נשמרת עד החודש שלפני, והחדשה מתחילה מהחודש שנבחר (פעולה אחת, בלי חפיפה ובלי דריסת העבר)
  const splitFixedExpense = async (id, fromMonth, newAmount) => {
    const old = data.fixedExpenses.find(f => f.id === id);
    if (!old || validateAmountChange(old, fromMonth, newAmount)) return;
    const sid = old.seriesId || old.id;
    const oldRec = {
      ...old,
      seriesId: sid,
      effectiveTo: prevMonthKey(fromMonth)
    };
    const newRec = {
      ...old,
      id: uid(),
      seriesId: sid,
      amount: Number(newAmount),
      effectiveFrom: fromMonth,
      effectiveTo: old.effectiveTo || null
    };
    await persist({
      ...data,
      fixedExpenses: [...data.fixedExpenses.map(f => f.id === id ? oldRec : f), newRec]
    });
  };
  const removeFixedExpense = async id => {
    await persist({
      ...data,
      fixedExpenses: data.fixedExpenses.filter(f => f.id !== id)
    });
  };
  const addIncome = async (monthK, source, amount, day) => {
    await persist({
      ...data,
      incomeEntries: [...data.incomeEntries, {
        id: uid(),
        monthKey: monthK,
        source,
        amount: round2(amount),
        day: day || 1
      }]
    });
  };
  const saveRecurringIncomes = async list => {
    await persist({
      ...data,
      recurringIncomes: list
    });
  };
  const addIncomeOverride = async (rid, monthK, amount, day) => {
    const r = (data.recurringIncomes || []).find(x => x.id === rid);
    if (!r || validateIncomeOverride(rid, monthK, amount, data.incomeEntries)) return;
    await persist({
      ...data,
      incomeEntries: [...data.incomeEntries, {
        id: uid(),
        monthKey: monthK,
        source: r.name,
        amount: round2(Number(amount)),
        day: day || r.day,
        recurringIncomeId: rid
      }]
    });
  };
  const linkIncomeEntries = async (rid, ids) => {
    if (!(data.recurringIncomes || []).some(x => x.id === rid) || !ids.length || validateIncomeLink(rid, ids, data.incomeEntries)) return;
    await persist({
      ...data,
      incomeEntries: data.incomeEntries.map(e => ids.includes(e.id) ? {
        ...e,
        recurringIncomeId: rid
      } : e)
    });
  };
  const saveCards = async cards => {
    await persist({
      ...data,
      settings: {
        ...data.settings,
        cards
      }
    });
  };
  const setCreditBillingDay = async day => {
    await persist({
      ...data,
      settings: {
        ...data.settings,
        creditBillingDay: day
      }
    });
  };
  const setVariableOverride = async (mKey, val) => {
    const next = {
      ...(data.settings.variableOverrides || {})
    };
    const metaNext = {
      ...(data.settings.variableOverrideMeta || {})
    };
    if (val === null || val === undefined) {
      delete next[mKey];
      delete metaNext[mKey];
    } else next[mKey] = round2(val);
    await persist({
      ...data,
      settings: {
        ...data.settings,
        variableOverrides: next,
        variableOverrideMeta: metaNext
      }
    });
  };
  // מטה של חיוב אשראי ידני: סטטוס (חלקי/סופי) והערה קצרה. תצוגה בלבד - אין שינוי בחישוב.
  const setVariableOverrideMeta = async (mKey, patch) => {
    const next = {
      ...(data.settings.variableOverrideMeta || {})
    };
    const merged = {
      status: "",
      note: "",
      ...(next[mKey] || {}),
      ...patch
    };
    if (!merged.status && !merged.note) delete next[mKey];else next[mKey] = merged;
    await persist({
      ...data,
      settings: {
        ...data.settings,
        variableOverrideMeta: next
      }
    });
  };
  // חלוקת התקציב המשתנה לפי אמצעי תשלום: הסכום ששולם במזומן/ביט יורד מהבנק באותו חודש, והשאר בחיוב האשראי.
  // ריק מוחק את החלוקה של החודש (והוא יורש את החלוקה האחרונה שהוגדרה לפניו); 0 מפורש = הכול אשראי באותו חודש וחוסם את הירושה.
  const setCashBudget = async (mKey, val) => {
    const next = {
      ...(data.settings.cashBudgets || {})
    };
    if (val === null || val === undefined || !(Number(val) >= 0)) delete next[mKey];else next[mKey] = round2(val);
    await persist({
      ...data,
      settings: {
        ...data.settings,
        cashBudgets: next
      }
    });
  };
  // שמירת ניתוח: תמיד על הנתונים העדכניים ביותר (ולא על עותק ישן מזמן שליחת הבקשה), כדי שתשובה שחזרה באיחור לא תדרוס שינויים.
  const dataRef = useRef(data);
  dataRef.current = data;
  const saveAdvice = async entry => {
    const cur = dataRef.current;
    const list = [entry, ...(cur.settings && cur.settings.advices || [])].slice(0, 40);
    await persist({
      ...cur,
      settings: {
        ...cur.settings,
        advices: list
      }
    });
  };
  const removeIncome = async id => {
    await persist({
      ...data,
      incomeEntries: data.incomeEntries.filter(i => i.id !== id)
    });
  };
  const addPlanned = async (name, amount, date) => {
    await persist({
      ...data,
      plannedExpenses: [...data.plannedExpenses, {
        id: uid(),
        name,
        amount: round2(amount),
        date
      }]
    });
  };
  const removePlanned = async id => {
    await persist({
      ...data,
      plannedExpenses: data.plannedExpenses.filter(p => p.id !== id)
    });
  };
  const toggleCreditLag = async () => {
    await persist({
      ...data,
      settings: {
        ...data.settings,
        creditLag: !data.settings.creditLag
      }
    });
  };
  const setOpeningBalance = async val => {
    await persist({
      ...data,
      settings: {
        ...data.settings,
        openingBalance: round2(val)
      }
    });
  };
  const setOpeningBalanceDate = async val => {
    await persist({
      ...data,
      settings: {
        ...data.settings,
        openingBalanceDate: val || ""
      }
    });
  };
  if (authState === "login") return /*#__PURE__*/React.createElement(LoginScreen, {
    onLoggedIn: () => {
      setLoading(true);
      reload();
    }
  });
  if (authState === "error") return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: COLORS.paper,
      color: COLORS.coral,
      padding: 20,
      textAlign: "center"
    }
  }, "לא ניתן לטעון את הנתונים. רעננו את הדף ונסו שוב.");
  if (loading) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLORS.paper
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: COLORS.sub
      }
    }, "טוען…"));
  }
  if (!user) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: "100vh",
        background: COLORS.paper,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: COLORS.card,
        borderRadius: 20,
        padding: 28,
        width: "100%",
        maxWidth: 380,
        boxShadow: "0 8px 30px rgba(20,33,61,0.08)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "Heebo, sans-serif",
        fontWeight: 800,
        fontSize: 24,
        color: COLORS.ink,
        marginBottom: 4
      }
    }, "האתר הפיננסי של משפחת חכם"), /*#__PURE__*/React.createElement("div", {
      style: {
        color: COLORS.sub,
        fontSize: 14,
        marginBottom: 20
      }
    }, "מי אתה?"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        marginBottom: 14
      }
    }, ["גולן", "צליל"].map(n => /*#__PURE__*/React.createElement("button", {
      key: n,
      onClick: () => setUser(n),
      style: {
        flex: 1,
        padding: "12px 8px",
        borderRadius: 12,
        border: `2px solid ${nameDraft === n ? COLORS.sage : COLORS.mist}`,
        background: nameDraft === n ? COLORS.sageLight : "#fff",
        color: COLORS.ink,
        fontWeight: 600,
        fontSize: 14,
        cursor: "pointer"
      }
    }, n))), /*#__PURE__*/React.createElement("input", {
      placeholder: "או הקלד/י שם משלך",
      value: ["גולן", "צליל"].includes(nameDraft) ? "" : nameDraft,
      onChange: e => setNameDraft(e.target.value),
      style: {
        width: "100%",
        padding: "12px 14px",
        borderRadius: 12,
        border: `1.5px solid ${COLORS.mist}`,
        fontSize: 14,
        marginBottom: 16,
        boxSizing: "border-box"
      }
    }), /*#__PURE__*/React.createElement("button", {
      disabled: !nameDraft.trim(),
      onClick: () => setUser(nameDraft.trim()),
      style: {
        width: "100%",
        padding: "13px",
        borderRadius: 12,
        border: "none",
        background: nameDraft.trim() ? COLORS.sage : COLORS.mist,
        color: "#fff",
        fontWeight: 700,
        fontSize: 15,
        cursor: nameDraft.trim() ? "pointer" : "default"
      }
    }, "כניסה"), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        marginTop: 14,
        fontSize: 11,
        color: COLORS.sub
      }
    }, "גרסה ", APP_VERSION, " · עודכן ", APP_VERSION_DATE)));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: COLORS.paper,
      color: COLORS.ink,
      paddingBottom: 90
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 20,
      background: COLORS.paper,
      paddingTop: 14,
      paddingBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 800,
      fontSize: 20
    }
  }, "תקציב המשפחה"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      background: COLORS.card,
      borderRadius: 10,
      padding: "6px 10px",
      fontSize: 13,
      color: COLORS.sub
    }
  }, "👤 ", user)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => changeMonth(1),
    "aria-label": "החודש הבא",
    style: {
      ...navBtnStyle,
      width: 44,
      height: 44
    }
  }, "›"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 17,
      minWidth: 140,
      textAlign: "center"
    }
  }, HEBREW_MONTHS[monthDate.getMonth()], " ", monthDate.getFullYear()), /*#__PURE__*/React.createElement("button", {
    onClick: () => changeMonth(-1),
    "aria-label": "החודש הקודם",
    style: {
      ...navBtnStyle,
      width: 44,
      height: 44
    }
  }, "‹"))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 16px 0"
    }
  }, tab === "dashboard" && /*#__PURE__*/React.createElement(Dashboard, {
    totalBudget: totalBudget,
    totalSpent: totalSpent,
    remaining: remaining,
    overallPct: overallPct,
    budgetSourceLabel: budgetSourceLabel,
    daysLeft: daysLeft,
    isCurrentMonth: isCurrentMonth,
    projected: projected,
    paceHigh: paceHigh,
    perCategory: perCategory,
    alerts: alerts,
    expenses: monthExpenses,
    categories: activeCategories,
    dim: dim,
    allExpenses: data.expenses,
    settings: data.settings,
    fixedExpenses: data.fixedExpenses,
    realNowKey: monthKey(now),
    onEditExpense: setEditExpense,
    onDeleteExpense: deleteExpense,
    onShowAllExpenses: () => setTab("expenses")
  }), tab === "expenses" && /*#__PURE__*/React.createElement(ExpensesTab, {
    key: mKey,
    expenses: data.expenses,
    categories: data.categories,
    selectedMonth: mKey,
    onEdit: setEditExpense
  }), tab === "more" && /*#__PURE__*/React.createElement(MoreMenu, {
    onPick: setTab,
    onRestore: restoreBackup,
    onLogout: logoutRequest
  }), (tab === "fixed" || tab === "budget" || tab === "advice") && /*#__PURE__*/React.createElement("button", {
    onClick: () => setTab("more"),
    style: {
      border: "none",
      background: "none",
      color: COLORS.sage,
      fontWeight: 700,
      fontSize: 13.5,
      cursor: "pointer",
      padding: "2px 0 10px",
      display: "block"
    }
  }, "‹ חזרה ל\"עוד\""), tab === "fixed" && /*#__PURE__*/React.createElement(FixedExpensesTab, {
    fixedExpenses: data.fixedExpenses,
    onAdd: addFixedExpense,
    onUpdate: updateFixedExpense,
    onRemove: removeFixedExpense,
    onSplit: splitFixedExpense,
    cards: data.settings.cards || [],
    plannedExpenses: data.plannedExpenses,
    onAddPlanned: addPlanned,
    onRemovePlanned: removePlanned,
    monthDate: monthDate
  }), tab === "forecast" && /*#__PURE__*/React.createElement(ForecastTab, {
    monthDate: monthDate,
    totalBudget: totalBudget,
    fixedExpenses: data.fixedExpenses,
    plannedExpenses: data.plannedExpenses,
    incomeEntries: data.incomeEntries,
    onAddIncome: addIncome,
    onRemoveIncome: removeIncome,
    budgets: data.budgets,
    categories: activeCategories,
    creditLag: data.settings.creditLag,
    onToggleCreditLag: toggleCreditLag,
    openingBalance: data.settings.openingBalance,
    onSetOpeningBalance: setOpeningBalance,
    openingBalanceDate: data.settings.openingBalanceDate || "",
    onSetOpeningBalanceDate: setOpeningBalanceDate,
    creditBillingDay: data.settings.creditBillingDay,
    onSetCreditBillingDay: setCreditBillingDay,
    cards: data.settings.cards || [],
    onSaveCards: saveCards,
    recurringIncomes: data.recurringIncomes || [],
    onSaveRecurring: saveRecurringIncomes,
    onAddOverride: addIncomeOverride,
    onLinkEntries: linkIncomeEntries,
    variableOverrides: data.settings.variableOverrides,
    onSetVariableOverride: setVariableOverride,
    variableOverrideMeta: data.settings.variableOverrideMeta || {},
    onSetVariableOverrideMeta: setVariableOverrideMeta,
    cashBudgets: data.settings.cashBudgets || {}
  }), tab === "budget" && /*#__PURE__*/React.createElement(BudgetTab, {
    key: mKey,
    categories: data.categories,
    monthBudgets: monthBudgets,
    budgetInfo: budgetInfo,
    onSetBudget: setCategoryBudget,
    onAddCategory: addCategory,
    onUpdateCategory: updateCategory,
    onRemoveCategory: removeCategory,
    onCopyPrev: copyPrevBudget,
    cashInfo: cashBudgetForMonth(data.settings.cashBudgets || {}, mKey),
    onSetCashBudget: v => setCashBudget(mKey, v),
    effectiveTotalBudget: budgetTotalForMonth(data.budgets, activeCategories, mKey)
  }), tab === "advice" && /*#__PURE__*/React.createElement(AdviceTab, {
    key: mKey,
    monthDate: monthDate,
    perCategory: perCategory,
    totalBudget: totalBudget,
    totalSpent: totalSpent,
    fixedExpenses: activeFixed.filter(f => isFixedInPeriod(f, mKey)),
    advices: data.settings.advices || [],
    legacyAdvice: data.settings.lastAdvice,
    onSaved: saveAdvice
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 0,
      right: 0,
      left: 0,
      background: COLORS.card,
      borderTop: `1px solid ${COLORS.mist}`,
      display: "flex",
      alignItems: "center",
      zIndex: 25,
      paddingBottom: "env(safe-area-inset-bottom, 0px)"
    }
  }, /*#__PURE__*/React.createElement(NavBtn, {
    active: tab === "dashboard",
    onClick: () => setTab("dashboard"),
    icon: "▦",
    label: "ראשי"
  }), /*#__PURE__*/React.createElement(NavBtn, {
    active: tab === "forecast",
    onClick: () => setTab("forecast"),
    icon: "📈",
    label: "תחזית"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAddExpense(true),
    "aria-label": "הוצאה חדשה",
    style: {
      width: 54,
      height: 54,
      marginTop: -22,
      borderRadius: 999,
      border: "none",
      background: COLORS.sage,
      color: "#fff",
      fontSize: 30,
      lineHeight: 1,
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(47,111,94,0.4)"
    }
  }, "＋")), /*#__PURE__*/React.createElement(NavBtn, {
    active: tab === "expenses",
    onClick: () => setTab("expenses"),
    icon: "🧾",
    label: "הוצאות"
  }), /*#__PURE__*/React.createElement(NavBtn, {
    active: ["more", "fixed", "budget", "advice"].includes(tab),
    onClick: () => setTab("more"),
    icon: "☰",
    label: "עוד"
  })), (showAddExpense || editExpense) && /*#__PURE__*/React.createElement(ExpenseModal, {
    categories: activeCategories.length ? activeCategories : data.categories,
    user: user,
    initial: editExpense,
    onClose: () => {
      setShowAddExpense(false);
      setEditExpense(null);
    },
    onSave: saveExpense,
    onDelete: async id => {
      if (await deleteExpense(id)) setEditExpense(null);
    }
  }), pendingRestore && /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-label": "אישור שחזור",
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(20,33,61,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 60,
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      padding: 20,
      maxWidth: 340,
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 800,
      fontSize: 16,
      marginBottom: 8
    }
  }, "לשחזר מהגיבוי?"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: COLORS.sub,
      marginBottom: 16
    }
  }, "כל הנתונים הנוכחיים יוחלפו. בקובץ: ", pendingRestore.expenses.length, " הוצאות, ", pendingRestore.fixedExpenses.length, " הוצאות קבועות."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: confirmRestore,
    style: {
      flex: 1,
      padding: 12,
      borderRadius: 12,
      border: "none",
      background: COLORS.sage,
      color: "#fff",
      fontWeight: 800
    }
  }, "שחזור"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setPendingRestore(null),
    style: {
      flex: 1,
      padding: 12,
      borderRadius: 12,
      border: `1px solid ${COLORS.mist}`,
      background: "none",
      fontWeight: 700
    }
  }, "ביטול")))), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      top: 16,
      left: "50%",
      transform: "translateX(-50%)",
      background: COLORS.ink,
      color: "#fff",
      padding: "10px 18px",
      borderRadius: 10,
      fontSize: 13,
      zIndex: 50
    }
  }, toast));
}
async function downloadBackup() {
  const res = await fetch("/api/export", {
    credentials: "same-origin"
  });
  if (!res.ok) {
    alert("הורדת הגיבוי נכשלה");
    return;
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "family-budget-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function MoreMenu({
  onPick,
  onRestore,
  onLogout
}) {
  const items = [{
    id: "fixed",
    icon: "📌",
    label: "הוצאות קבועות",
    sub: "סכומים, כרטיסים, תוקף ושינוי סכום"
  }, {
    id: "budget",
    icon: "💰",
    label: "תקציב",
    sub: "תקציב לכל קטגוריה וחלוקת מזומן/אשראי"
  }, {
    id: "advice",
    icon: "💬",
    label: "ייעוץ",
    sub: "חוות דעת וניתוחים קודמים"
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      overflow: "hidden"
    }
  }, items.map((it, i) => /*#__PURE__*/React.createElement("button", {
    key: it.id,
    onClick: () => onPick(it.id),
    style: {
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 16px",
      border: "none",
      borderTop: i ? `1px solid ${COLORS.mist}` : "none",
      background: "none",
      cursor: "pointer",
      textAlign: "start",
      color: COLORS.ink
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22
    }
  }, it.icon), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontWeight: 700,
      fontSize: 15
    }
  }, it.label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: 12,
      color: COLORS.sub,
      marginTop: 2
    }
  }, it.sub)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.sub
    }
  }, "‹"))), /*#__PURE__*/React.createElement("button", {
    onClick: downloadBackup,
    style: {
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 16px",
      border: "none",
      borderTop: `1px solid ${COLORS.mist}`,
      background: "none",
      cursor: "pointer",
      textAlign: "right",
      font: "inherit",
      color: "inherit"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22
    }
  }, "⬇️"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontWeight: 700,
      fontSize: 15
    }
  }, "הורדת גיבוי"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: 12,
      color: COLORS.sub,
      marginTop: 2
    }
  }, "קובץ עם כל הנתונים, מומלץ פעם בחודש"))), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 16px",
      borderTop: `1px solid ${COLORS.mist}`,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22
    }
  }, "⬆️"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontWeight: 700,
      fontSize: 15
    }
  }, "שחזור מגיבוי"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: 12,
      color: COLORS.sub,
      marginTop: 2
    }
  }, "מחליף את כל הנתונים הנוכחיים בקובץ גיבוי")), /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: "application/json,.json",
    "aria-label": "קובץ גיבוי",
    style: {
      display: "none"
    },
    onChange: e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (f) onRestore(f);
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: onLogout,
    style: {
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 16px",
      border: "none",
      borderTop: `1px solid ${COLORS.mist}`,
      background: "none",
      cursor: "pointer",
      textAlign: "right",
      font: "inherit",
      color: "inherit"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22
    }
  }, "🚪"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontWeight: 700,
      fontSize: 15
    }
  }, "יציאה"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: 12,
      color: COLORS.sub,
      marginTop: 2
    }
  }, "נעילת האתר במכשיר זה; הכניסה מחדש עם הקוד המשפחתי"))));
}
const navBtnStyle = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: "none",
  background: COLORS.card,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: COLORS.ink,
  fontSize: 18
};
function NavBtn({
  active,
  onClick,
  icon,
  label
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      flex: 1,
      border: "none",
      background: "none",
      padding: "10px 0 8px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
      color: active ? COLORS.sage : COLORS.sub
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: active ? 700 : 500
    }
  }, label));
}

/* ================= DASHBOARD ================= */
/* ================= ALERTS SUMMARY ================= */
const ALERT_STYLE = {
  over: {
    bg: COLORS.coralLight,
    fg: COLORS.coral,
    icon: "●",
    label: n => n === 1 ? "חריגה אחת" : `${n} חריגות`
  },
  pace: {
    bg: COLORS.amberLight,
    fg: "#8a6400",
    icon: "◔",
    label: () => "קצב גבוה"
  },
  near: {
    bg: COLORS.amberLight,
    fg: "#8a6400",
    icon: "●",
    label: n => n === 1 ? "קטגוריה מתקרבת" : `${n} מתקרבות`
  },
  full: {
    bg: COLORS.sageLight,
    fg: COLORS.sage,
    icon: "✓",
    label: n => n === 1 ? "נוצל במלואו" : `${n} נוצלו במלואם`
  }
};
function AlertsSummary({
  alerts
}) {
  const [open, setOpen] = useState(false);
  if (!alerts.length) return null;
  const counts = {};
  alerts.forEach(a => {
    counts[a.kind] = (counts[a.kind] || 0) + 1;
  });
  const kinds = ["over", "pace", "near", "full"].filter(k => counts[k]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14,
      background: COLORS.card,
      borderRadius: 14,
      boxShadow: "0 2px 10px rgba(20,33,61,0.04)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(o => !o),
    "aria-expanded": open,
    style: {
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 12px",
      border: "none",
      background: "none",
      cursor: "pointer",
      minHeight: 44,
      textAlign: "start",
      color: COLORS.ink
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      flex: 1,
      minWidth: 0
    }
  }, kinds.map(k => /*#__PURE__*/React.createElement("span", {
    key: k,
    style: {
      background: ALERT_STYLE[k].bg,
      color: ALERT_STYLE[k].fg,
      borderRadius: 999,
      padding: "4px 10px",
      fontSize: 12.5,
      fontWeight: 700,
      whiteSpace: "nowrap"
    }
  }, ALERT_STYLE[k].icon, " ", ALERT_STYLE[k].label(counts[k])))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: COLORS.sub,
      whiteSpace: "nowrap"
    }
  }, open ? "הסתר פירוט ▴" : "הצג פירוט ▾")), open && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      padding: "0 12px 12px"
    }
  }, alerts.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.kind + a.key,
    style: {
      padding: "9px 12px",
      borderRadius: 10,
      background: ALERT_STYLE[a.kind].bg,
      color: ALERT_STYLE[a.kind].fg,
      fontSize: 13,
      fontWeight: 600,
      overflowWrap: "anywhere"
    }
  }, a.text))));
}
function AttentionList({
  alerts
}) {
  const [more, setMore] = useState(false);
  if (!alerts.length) return null;
  const urgent = alerts.filter(a => a.kind === "over" || a.kind === "pace");
  const rest = alerts.filter(a => !(a.kind === "over" || a.kind === "pace"));
  const rowFor = a => /*#__PURE__*/React.createElement("div", {
    key: a.kind + a.key,
    style: {
      padding: "9px 12px",
      borderRadius: 10,
      background: ALERT_STYLE[a.kind].bg,
      color: ALERT_STYLE[a.kind].fg,
      fontSize: 13,
      fontWeight: 600,
      overflowWrap: "anywhere"
    }
  }, a.text);
  const counts = {};
  rest.forEach(a => {
    counts[a.kind] = (counts[a.kind] || 0) + 1;
  });
  const restLabel = ["near", "full"].filter(k => counts[k]).map(k => ALERT_STYLE[k].label(counts[k])).join(" · ");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 14,
      margin: "2px 2px 8px",
      color: COLORS.sub
    }
  }, "דורש תשומת לב"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, urgent.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "9px 12px",
      borderRadius: 10,
      background: COLORS.sageLight,
      color: COLORS.sage,
      fontSize: 13,
      fontWeight: 600
    }
  }, "אין חריגות"), urgent.map(rowFor), rest.length > 0 && /*#__PURE__*/React.createElement("button", {
    onClick: () => setMore(m => !m),
    "aria-expanded": more,
    style: {
      border: "none",
      background: COLORS.card,
      borderRadius: 10,
      padding: "10px 12px",
      display: "flex",
      justifyContent: "space-between",
      cursor: "pointer",
      fontSize: 12.5,
      color: COLORS.sub,
      minHeight: 44
    }
  }, /*#__PURE__*/React.createElement("span", null, restLabel), /*#__PURE__*/React.createElement("span", null, more ? "הסתר ▴" : "הצג ▾")), more && rest.map(rowFor)));
}
// רצועת "מצב הנתונים" - תצוגה בלבד: מבחינה בין נתון מאומת, חלקי והערכה. לא משנה שום חישוב.
function DataStatusStrip({
  settings,
  fixedExpenses,
  realNowKey
}) {
  const rows = [];
  const ob = Number(settings && settings.openingBalance) || 0;
  const obDate = settings && settings.openingBalanceDate || "";
  if (ob !== 0 || obDate) {
    rows.push({
      key: "ob",
      label: "יתרת פתיחה לתחזית",
      value: fmt(ob),
      tag: obDate ? {
        text: `מעוגנת ל־${obDate.split("-").reverse().join(".")}`,
        tone: "ok"
      } : {
        text: "לא מאומתת · חסר תאריך",
        tone: "warn"
      }
    });
  }
  const nextK = shiftMonthKey(realNowKey, 1);
  const nextOvr = settings && settings.variableOverrides ? settings.variableOverrides[nextK] : undefined;
  if (nextOvr !== undefined && nextOvr !== null) {
    const st = settings && settings.variableOverrideMeta && settings.variableOverrideMeta[nextK] ? settings.variableOverrideMeta[nextK].status : "";
    const nextName = HEBREW_MONTHS[Number(nextK.split("-")[1]) - 1];
    rows.push({
      key: "bill",
      label: `חיוב אשראי ל${nextName}`,
      value: fmt(nextOvr),
      tag: st === "partial" ? {
        text: "חלקי",
        tone: "warn"
      } : st === "final" ? {
        text: "סופי",
        tone: "ok"
      } : {
        text: "טרם סומן חלקי/סופי",
        tone: "warn"
      }
    });
  }
  const est = (fixedExpenses || []).filter(f => f.active !== false && isFixedInPeriod(f, realNowKey) && /הערכה|ממוצע/.test(f.name || ""));
  if (est.length) {
    const names = est.map(f => String(f.name).replace(/\s*\((הערכה|ממוצע)\)\s*/g, "").trim());
    const sameFreq = est.every(f => (f.frequencyMonths || 1) === (est[0].frequencyMonths || 1));
    const label = names.join(", ") + (sameFreq && (est[0].frequencyMonths || 1) > 1 ? ` · ${fixedFreqLabel(est[0].frequencyMonths)}` : "");
    rows.push({
      key: "est",
      label,
      value: est.map(f => fmt(f.amount).replace(" ₪", "")).join(" + ") + " ₪",
      tag: {
        text: "הערכה",
        tone: "warn"
      }
    });
  }
  if (!rows.length) return null;
  const tones = {
    warn: {
      bg: COLORS.amberLight,
      fg: "#8a6400",
      bar: COLORS.amber
    },
    ok: {
      bg: COLORS.sageLight,
      fg: COLORS.sage,
      bar: COLORS.sage
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 14,
      margin: "2px 2px 8px",
      color: COLORS.sub
    }
  }, "מצב הנתונים"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, rows.map(r => {
    const t = tones[r.tag.tone];
    return /*#__PURE__*/React.createElement("div", {
      key: r.key,
      style: {
        background: COLORS.card,
        borderRadius: 10,
        padding: "9px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        borderInlineStart: `4px solid ${t.bar}`,
        fontSize: 13,
        boxShadow: "0 1px 4px rgba(20,33,61,0.04)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: COLORS.ink,
        minWidth: 0
      }
    }, r.label, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10.5,
        fontWeight: 700,
        color: t.fg,
        background: t.bg,
        borderRadius: 6,
        padding: "1px 6px",
        whiteSpace: "nowrap"
      }
    }, r.tag.text)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        color: COLORS.ink,
        whiteSpace: "nowrap"
      }
    }, r.value));
  })));
}
function Dashboard({
  totalBudget,
  totalSpent,
  remaining,
  overallPct,
  daysLeft,
  isCurrentMonth,
  projected,
  paceHigh,
  perCategory,
  alerts,
  expenses,
  categories,
  dim,
  onEditExpense,
  onDeleteExpense,
  onShowAllExpenses,
  budgetSourceLabel,
  allExpenses,
  settings,
  fixedExpenses,
  realNowKey
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const gaugeColor = statusColor(overallPct);
  const recent = [...expenses].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 3);
  const barData = perCategory.filter(c => c.budget > 0 || c.spent > 0).map(c => ({
    name: c.name,
    budget: c.budget,
    spent: c.spent
  }));
  const pieData = perCategory.filter(c => c.spent > 0).map(c => ({
    name: c.name,
    value: c.spent
  }));
  const cumulative = useMemo(() => {
    const byDay = {};
    expenses.forEach(e => {
      const day = Number(e.date?.split("-")[2]);
      if (day) byDay[day] = (byDay[day] || 0) + Number(e.amount || 0);
    });
    let running = 0;
    const arr = [];
    const lastDay = isCurrentMonth ? new Date().getDate() : dim;
    for (let d = 1; d <= lastDay; d++) {
      running += byDay[d] || 0;
      arr.push({
        day: d,
        spent: running
      });
    }
    return arr;
  }, [expenses, dim, isCurrentMonth]);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 20,
      padding: 20,
      boxShadow: "0 4px 20px rgba(20,33,61,0.05)",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(RingGauge, {
    percent: overallPct,
    color: gaugeColor
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 800,
      fontSize: 22
    }
  }, Math.round(overallPct), "%"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: COLORS.sub
    }
  }, "נוצל"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Row, {
    label: "תקציב משתנה כולל",
    value: fmt(totalBudget)
  }), /*#__PURE__*/React.createElement(Row, {
    label: "הוצאות בפועל",
    value: fmt(totalSpent)
  }), /*#__PURE__*/React.createElement(Row, {
    label: "נשאר לתקציב",
    value: fmt(remaining),
    bold: true,
    color: remaining < 0 ? COLORS.coral : COLORS.sage
  }))), budgetSourceLabel && totalBudget > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 11.5,
      color: COLORS.sub,
      lineHeight: 1.5
    }
  }, "התקציב נמשך אוטומטית מ", budgetSourceLabel, ". שינוי ערך במסך התקציב יחול על החודש המוצג בלבד."), isCurrentMonth && (() => {
    let latest = "";
    (allExpenses || []).forEach(e => {
      if (e.date && e.date > latest) latest = e.date;
    });
    if (!latest) return null;
    const parts = latest.split("-");
    const stale = Math.floor((new Date(todayISO()) - new Date(latest)) / 86400000) >= 3;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 12,
        padding: "9px 12px",
        borderRadius: 10,
        fontSize: 12.5,
        lineHeight: 1.5,
        background: stale ? COLORS.amberLight : COLORS.paper,
        border: `1px solid ${stale ? COLORS.amber : COLORS.mist}`,
        color: stale ? "#8a6400" : COLORS.sub
      }
    }, "תאריך ההוצאה האחרונה ברשימה: ", /*#__PURE__*/React.createElement("b", null, `${Number(parts[2])}.${Number(parts[1])}`), stale ? " · ייתכן שיש הוצאות נוספות שטרם נרשמו" : "");
  })(), isCurrentMonth && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      paddingTop: 14,
      borderTop: `1px solid ${COLORS.mist}`,
      display: "flex",
      justifyContent: "space-between",
      fontSize: 13,
      color: COLORS.sub
    }
  }, /*#__PURE__*/React.createElement("span", null, daysLeft, " ימים נותרו החודש"), totalBudget > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      color: paceHigh ? COLORS.coral : COLORS.sage,
      fontWeight: 600
    }
  }, paceHigh ? "↑ קצב גבוה" : "↓ בקצב טוב")), isCurrentMonth && totalBudget > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 12.5,
      color: COLORS.sub
    }
  }, "אם תמשיך בקצב הנוכחי, צפוי שתסיים את החודש ב־", /*#__PURE__*/React.createElement("b", {
    style: {
      color: COLORS.ink
    }
  }, fmt(projected)))), /*#__PURE__*/React.createElement(DataStatusStrip, {
    settings: settings,
    fixedExpenses: fixedExpenses,
    realNowKey: realNowKey
  }), /*#__PURE__*/React.createElement(AttentionList, {
    alerts: alerts
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setDetailOpen(o => !o),
    "aria-expanded": detailOpen,
    style: {
      width: "100%",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      background: COLORS.card,
      border: "none",
      borderRadius: 14,
      padding: "13px 14px",
      marginBottom: 14,
      cursor: "pointer",
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 14.5,
      color: COLORS.ink,
      minHeight: 44
    }
  }, /*#__PURE__*/React.createElement("span", null, "פירוט לפי קטגוריה וגרפים"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: COLORS.sub
    }
  }, detailOpen ? "הסתר ▴" : "הצג ▾")), detailOpen && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 15,
      margin: "6px 2px 8px"
    }
  }, "קטגוריות"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 18
    }
  }, perCategory.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    style: {
      background: COLORS.card,
      borderRadius: 16,
      padding: 13,
      boxShadow: "0 2px 10px rgba(20,33,61,0.04)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17
    }
  }, c.icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, c.name)), /*#__PURE__*/React.createElement(ProgressBar, {
    percent: c.percent,
    color: statusColor(c.percent)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: 7,
      fontSize: 11.5,
      color: COLORS.sub
    }
  }, /*#__PURE__*/React.createElement("span", null, fmt(c.spent)), /*#__PURE__*/React.createElement("span", null, fmt(c.budget))), (() => {
    const st = categoryBudgetState(c.budget, c.spent);
    if (st.state === "over") return /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 5,
        fontSize: 11,
        fontWeight: 700,
        color: COLORS.coral
      }
    }, "חריגה של ", fmtAgorot(st.diffAg));
    if (st.state === "full") return /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 5,
        fontSize: 11,
        fontWeight: 700,
        color: COLORS.sage
      }
    }, "התקציב נוצל במלואו");
    return /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 5,
        fontSize: 11,
        color: COLORS.sub
      }
    }, "נשאר ", fmt(c.remaining));
  })()))), barData.length > 0 && /*#__PURE__*/React.createElement(ChartCard, {
    title: "תקציב מול ביצוע"
  }, /*#__PURE__*/React.createElement(BudgetVsActualChart, {
    data: barData
  })), pieData.length > 0 && /*#__PURE__*/React.createElement(ChartCard, {
    title: "התפלגות הוצאות"
  }, /*#__PURE__*/React.createElement(DonutChart, {
    data: pieData
  })), cumulative.length > 1 && /*#__PURE__*/React.createElement(ChartCard, {
    title: "הוצאות מצטברות במהלך החודש"
  }, /*#__PURE__*/React.createElement(CumulativeLineChart, {
    points: cumulative,
    budget: totalBudget
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 15,
      margin: "6px 2px 8px"
    }
  }, "הוצאות אחרונות"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 20
    }
  }, recent.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      fontSize: 13,
      color: COLORS.sub,
      textAlign: "center"
    }
  }, "עדיין אין הוצאות החודש"), recent.map((e, i) => /*#__PURE__*/React.createElement(ExpenseRow, {
    key: e.id,
    exp: e,
    categories: categories,
    last: i === recent.length - 1,
    onEdit: onEditExpense,
    onDelete: onDeleteExpense
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: onShowAllExpenses,
    style: {
      width: "100%",
      border: "none",
      background: "none",
      color: COLORS.sage,
      fontWeight: 700,
      fontSize: 14,
      cursor: "pointer",
      padding: "0 0 20px",
      minHeight: 44
    }
  }, "כל ההוצאות ‹"));
}
function Row({
  label,
  value,
  bold,
  color
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      padding: "3px 0",
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.sub
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: bold ? 800 : 600,
      color: color || COLORS.ink,
      fontFamily: bold ? "Heebo, sans-serif" : "Assistant, sans-serif"
    }
  }, value));
}
function ChartCard({
  title,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      padding: "14px 12px",
      marginBottom: 14,
      boxShadow: "0 2px 10px rgba(20,33,61,0.04)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 13.5,
      marginBottom: 10
    }
  }, title), children);
}
function categoryOf(categories, id) {
  return categories.find(c => c.id === id) || {
    name: "לא ידוע",
    icon: "❓"
  };
}
function ExpenseRow({
  exp,
  categories,
  last,
  onEdit,
  onDelete
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const cat = categoryOf(categories, exp.categoryId);
  const d = exp.date ? exp.date.split("-").reverse().join("/") : "";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "11px 14px",
      borderBottom: last ? "none" : `1px solid ${COLORS.mist}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 19
    }
  }, cat.icon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      fontWeight: 600,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, exp.description || cat.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub
    }
  }, cat.name, " · ", d, " · ", exp.user)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 14,
      whiteSpace: "nowrap"
    }
  }, fmt(exp.amount)), !confirmDel ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onEdit(exp),
    style: iconBtnStyle
  }, "✎"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setConfirmDel(true),
    style: {
      ...iconBtnStyle,
      color: COLORS.coral
    }
  }, "🗑")) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onDelete(exp.id);
      setConfirmDel(false);
    },
    style: {
      ...iconBtnStyle,
      background: COLORS.coral,
      color: "#fff"
    }
  }, "✓"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setConfirmDel(false),
    style: iconBtnStyle
  }, "✕")));
}
const iconBtnStyle = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "none",
  background: COLORS.paper,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontSize: 13
};

/* ================= EXPENSES TAB ================= */
function ExpensesTab({
  expenses,
  categories,
  selectedMonth,
  onEdit
}) {
  const [filterCat, setFilterCat] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const monthEntries = useMemo(() => expenses.filter(e => (e.date || "").startsWith(selectedMonth + "-")), [expenses, selectedMonth]);
  const users = useMemo(() => [...new Set(monthEntries.map(e => e.user).filter(Boolean))], [monthEntries]);
  const filtered = useMemo(() => monthEntries.filter(e => !filterCat || e.categoryId === filterCat).filter(e => !filterUser || e.user === filterUser).filter(e => !q.trim() || (e.description || "").toLocaleLowerCase().includes(q.trim().toLocaleLowerCase())).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0)), [monthEntries, filterCat, filterUser, q]);
  const total = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
  const days = useMemo(() => {
    const grouped = new Map();
    filtered.forEach(e => {
      if (!grouped.has(e.date)) grouped.set(e.date, []);
      grouped.get(e.date).push(e);
    });
    return [...grouped.entries()];
  }, [filtered]);
  const filterCount = Number(!!filterCat) + Number(!!filterUser);
  const isFiltered = !!(filterCat || filterUser || q.trim());
  const clear = () => {
    setFilterCat("");
    setFilterUser("");
    setQ("");
  };
  const control = {
    minHeight: 44,
    fontSize: 14,
    borderRadius: 10,
    border: `1px solid ${COLORS.mist}`,
    background: "#fff",
    color: COLORS.ink,
    fontFamily: "inherit",
    padding: "10px 12px"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 760,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontSize: 21,
      margin: "2px 2px 12px"
    }
  }, "הוצאות"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: COLORS.sub
    }
  }, isFiltered ? "נרשם בחודש זה · לפי הסינון" : "נרשם בחודש זה"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: 10,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("strong", {
    "data-testid": "expenses-total",
    style: {
      fontSize: 28,
      fontFamily: "Heebo, sans-serif"
    }
  }, fmt(total)), /*#__PURE__*/React.createElement("span", {
    "data-testid": "expenses-count",
    style: {
      fontSize: 14,
      color: COLORS.sub
    }
  }, filtered.length, " הוצאות")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: COLORS.sub,
      borderTop: `1px solid ${COLORS.mist}`,
      paddingTop: 10,
      marginTop: 10
    }
  }, "רק הוצאות מ", monthLabelOf(selectedMonth), " · לפי תאריך ההוצאה")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("input", {
    "aria-label": "חיפוש בחודש הזה",
    placeholder: "חיפוש בחודש הזה…",
    value: q,
    onChange: e => setQ(e.target.value),
    style: {
      ...control,
      minWidth: 0,
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    "aria-expanded": showFilters,
    "aria-controls": "expense-filters",
    onClick: () => setShowFilters(v => !v),
    style: {
      ...control,
      fontWeight: 600,
      flexShrink: 0
    }
  }, "סינון", filterCount ? ` (${filterCount})` : "", " ", showFilters ? "▴" : "▾")), showFilters && /*#__PURE__*/React.createElement("div", {
    id: "expense-filters",
    style: {
      background: COLORS.card,
      borderRadius: 14,
      padding: 12,
      marginBottom: 12,
      display: "flex",
      flexWrap: "wrap",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      flex: "1 1 130px",
      fontSize: 12,
      color: COLORS.sub
    }
  }, "קטגוריה", /*#__PURE__*/React.createElement("select", {
    "aria-label": "סינון לפי קטגוריה",
    value: filterCat,
    onChange: e => setFilterCat(e.target.value),
    style: {
      ...control,
      width: "100%",
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "כל הקטגוריות"), categories.map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.icon, " ", c.name)))), /*#__PURE__*/React.createElement("label", {
    style: {
      flex: "1 1 130px",
      fontSize: 12,
      color: COLORS.sub
    }
  }, "מי ביצע", /*#__PURE__*/React.createElement("select", {
    "aria-label": "סינון לפי משתמש",
    value: filterUser,
    onChange: e => setFilterUser(e.target.value),
    style: {
      ...control,
      width: "100%",
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "כל המשתמשים"), users.map(u => /*#__PURE__*/React.createElement("option", {
    key: u,
    value: u
  }, u))))), isFiltered && /*#__PURE__*/React.createElement("button", {
    onClick: clear,
    style: {
      ...control,
      background: "none",
      border: "none",
      color: COLORS.sage,
      fontWeight: 700
    }
  }, "ניקוי החיפוש והסינון"), filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "28px 16px",
      textAlign: "center",
      color: COLORS.sub,
      background: COLORS.card,
      borderRadius: 16
    }
  }, monthEntries.length === 0 ? "אין עדיין הוצאות בחודש הזה" : "לא נמצאו הוצאות לפי הסינון"), days.map(([date, entries]) => /*#__PURE__*/React.createElement("section", {
    key: date,
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      justifyContent: "space-between",
      padding: "10px 4px 8px",
      fontSize: 13,
      color: COLORS.sub
    }
  }, /*#__PURE__*/React.createElement("strong", null, `${Number(date.slice(8, 10))} ב${HEBREW_MONTHS[Number(date.slice(5, 7)) - 1]}`), /*#__PURE__*/React.createElement("span", null, entries.length === 1 ? "הוצאה אחת" : `${entries.length} הוצאות`, " · ", fmt(entries.reduce((s, e) => s + Number(e.amount || 0), 0)))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      overflow: "hidden"
    }
  }, entries.map((e, i) => {
    const cat = categoryOf(categories, e.categoryId);
    return /*#__PURE__*/React.createElement("button", {
      key: e.id,
      "data-expense-id": e.id,
      onClick: () => onEdit(e),
      "aria-label": `עריכת ${e.description || cat.name}, ${fmt(e.amount)}`,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        minHeight: 68,
        padding: "12px 14px",
        textAlign: "right",
        color: COLORS.ink,
        background: "none",
        border: "none",
        borderBottom: i === entries.length - 1 ? "none" : `1px solid ${COLORS.mist}`,
        fontFamily: "inherit",
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 700,
        overflowWrap: "anywhere"
      }
    }, e.description || cat.name), /*#__PURE__*/React.createElement("div", {
      style: {
        color: COLORS.sub,
        fontSize: 12.5,
        marginTop: 4
      }
    }, cat.name, " · ", e.user)), /*#__PURE__*/React.createElement("strong", {
      style: {
        fontSize: 16,
        whiteSpace: "nowrap"
      }
    }, fmt(e.amount)), /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        color: COLORS.sub,
        fontSize: 20
      }
    }, "‹"));
  })))));
}
const selectStyle = {
  padding: "8px 10px",
  borderRadius: 10,
  border: `1px solid ${COLORS.mist}`,
  fontSize: 12.5,
  background: "#fff",
  flex: 1,
  minWidth: 110
};

/* ================= FIXED EXPENSE PERIODS ================= */
function monthLabelOf(k) {
  const m = /^(\d{4})-(\d{2})$/.exec(k || "");
  return m ? `${HEBREW_MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
}
function MonthPicker({
  value,
  onChange,
  allowEmpty,
  label
}) {
  const nowY = new Date().getFullYear();
  const [y, m] = MONTH_RE.test(value || "") ? value.split("-") : ["", ""];
  const years = [];
  for (let i = nowY - 2; i <= nowY + 14; i++) years.push(String(i));
  if (y && !years.includes(y)) years.push(y);
  const set = (ny, nm) => {
    if (!ny && !nm) return onChange("");
    onChange(`${ny || String(nowY)}-${nm || "01"}`);
  };
  const sel = {
    height: 40,
    borderRadius: 10,
    border: `1px solid ${COLORS.mist}`,
    background: "#fff",
    fontSize: 16,
    fontFamily: "inherit",
    minWidth: 0,
    flex: 1,
    padding: "0 6px"
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("select", {
    "aria-label": label + " - חודש",
    value: m,
    onChange: e => set(y, e.target.value),
    style: sel
  }, allowEmpty && /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "ללא הגבלה"), HEBREW_MONTHS.map((n, i) => /*#__PURE__*/React.createElement("option", {
    key: i,
    value: String(i + 1).padStart(2, "0")
  }, n))), /*#__PURE__*/React.createElement("select", {
    "aria-label": label + " - שנה",
    value: y,
    onChange: e => set(e.target.value, m),
    style: {
      ...sel,
      flex: "0 0 86px"
    },
    disabled: allowEmpty && !m
  }, allowEmpty && !y && /*#__PURE__*/React.createElement("option", {
    value: ""
  }), years.map(v => /*#__PURE__*/React.createElement("option", {
    key: v,
    value: v
  }, v)))));
}
function FixedPeriodPanel({
  f,
  mKey,
  siblings,
  onUpdate,
  onSplit,
  onClose
}) {
  const [from, setFrom] = useState(f.effectiveFrom || "");
  const [to, setTo] = useState(f.effectiveTo || "");
  const [err, setErr] = useState("");
  const [chgMonth, setChgMonth] = useState(MONTH_RE.test(f.effectiveFrom || "") && mKey <= f.effectiveFrom ? "" : mKey);
  const [chgAmount, setChgAmount] = useState("");
  const [err2, setErr2] = useState("");
  const chgErr = chgMonth && chgAmount !== "" ? validateAmountChange(f, chgMonth, chgAmount) : "";
  const box = {
    background: COLORS.paper,
    borderRadius: 12,
    padding: 12,
    marginTop: 8
  };
  const btn = primary => ({
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    border: primary ? "none" : `1px solid ${COLORS.mist}`,
    background: primary ? COLORS.sage : "#fff",
    color: primary ? "#fff" : COLORS.ink,
    fontWeight: 700,
    fontSize: 13.5,
    cursor: "pointer"
  });
  const savePeriod = () => {
    const e = validateFixedPeriod(from, to, siblings);
    if (e) return setErr(e);
    setErr("");
    onUpdate(f.id, {
      effectiveFrom: from || null,
      effectiveTo: to || null
    });
    onClose();
  };
  const applyChange = () => {
    const e = validateAmountChange(f, chgMonth, chgAmount);
    if (e) return setErr2(e);
    onSplit(f.id, chgMonth, Number(chgAmount));
    onClose();
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-panel",
    style: {
      gridColumn: "1 / -1",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: box
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13,
      marginBottom: 8
    }
  }, "תקופת תוקף"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(MonthPicker, {
    label: "החל מחודש",
    value: from,
    onChange: setFrom,
    allowEmpty: true
  }), /*#__PURE__*/React.createElement(MonthPicker, {
    label: "עד חודש",
    value: to,
    onChange: setTo,
    allowEmpty: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      marginTop: 6
    }
  }, "החודשים כלולים בתקופה. \"ללא הגבלה\" = בלי גבול בצד הזה. היסטוריה לא נמחקת, והתדירות וחודש העוגן (", fixedFreqLabel(f.frequencyMonths), ") לא משתנים."), err && /*#__PURE__*/React.createElement("div", {
    role: "alert",
    style: {
      color: COLORS.coral,
      fontSize: 12.5,
      fontWeight: 600,
      marginTop: 6
    }
  }, err), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: btn(false)
  }, "סגירה"), /*#__PURE__*/React.createElement("button", {
    onClick: savePeriod,
    style: btn(true)
  }, "שמירת תוקף"))), /*#__PURE__*/React.createElement("div", {
    style: box
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13,
      marginBottom: 8
    }
  }, "שינוי סכום החל מחודש"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(MonthPicker, {
    label: "החל מחודש",
    value: chgMonth,
    onChange: setChgMonth
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "סכום חדש (₪)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "decimal",
    value: chgAmount,
    onChange: e => setChgAmount(e.target.value),
    placeholder: String(f.amount),
    style: {
      ...inputStyle,
      height: 40,
      fontSize: 16
    }
  }))), chgMonth && chgAmount !== "" && !chgErr && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      marginTop: 8,
      lineHeight: 1.5,
      background: COLORS.sageLight,
      borderRadius: 10,
      padding: "8px 10px"
    }
  }, "הסכום הנוכחי ", fmt(f.amount), " יישמר עד ", monthLabelOf(prevMonthKey(chgMonth)), ", והסכום החדש ", fmt(chgAmount), " יחול מ־", monthLabelOf(chgMonth), ". חודשים קודמים לא ישתנו."), (chgErr || err2) && /*#__PURE__*/React.createElement("div", {
    role: "alert",
    style: {
      color: COLORS.coral,
      fontSize: 12.5,
      fontWeight: 600,
      marginTop: 6
    }
  }, chgErr || err2), /*#__PURE__*/React.createElement("button", {
    onClick: applyChange,
    disabled: !chgMonth || chgAmount === "" || !!chgErr,
    style: {
      ...btn(true),
      width: "100%",
      marginTop: 10,
      opacity: !chgMonth || chgAmount === "" || chgErr ? 0.5 : 1
    }
  }, chgMonth ? `אישור: החל מ־${monthLabelOf(chgMonth)}` : "בחר חודש")));
}

/* ================= FIXED EXPENSES TAB ================= */
function FixedExpensesTab({
  fixedExpenses,
  onAdd,
  onUpdate,
  onRemove,
  onSplit,
  cards,
  plannedExpenses,
  onAddPlanned,
  onRemovePlanned,
  monthDate
}) {
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
  const reset = () => {
    setName("");
    setAmount("");
    setDueDay("1");
    setFreq("1");
    setFromM("");
    setToM("");
    setAddErr("");
    setAddCredit(false);
    setAddCard("");
    setAdding(false);
  };
  const [addingPlanned, setAddingPlanned] = useState(false);
  const [pName, setPName] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pDate, setPDate] = useState(todayISO());
  const plannedDateOk = p => typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date);
  const upcomingPlanned = plannedExpenses.filter(p => plannedDateOk(p) && p.date >= mKey + "-01").sort((a, b) => a.date.localeCompare(b.date));
  // מתוכננות שעברו (או בלי תאריך תקין) נשמרות גלויות וניתנות למחיקה, במקום להיעלם מהממשק
  const pastPlanned = plannedExpenses.filter(p => !plannedDateOk(p) || p.date < mKey + "-01").sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const [showPastPlanned, setShowPastPlanned] = useState(false);
  const resetPlanned = () => {
    setPName("");
    setPAmount("");
    setPDate(todayISO());
    setAddingPlanned(false);
  };
  const renderFixedFull = (f, i, list) => /*#__PURE__*/React.createElement("div", {
    key: f.id,
    className: "fx-card",
    style: {
      borderBottom: i === list.length - 1 ? "none" : `1px solid ${COLORS.mist}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fx-main"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: COLORS.sageLight,
      color: COLORS.sage,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 800,
      fontSize: 12.5,
      flexShrink: 0
    }
  }, f.dueDay), /*#__PURE__*/React.createElement("div", {
    className: "fx-text"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "fx-name",
    rows: 1,
    defaultValue: f.name,
    "aria-label": "שם ההוצאה",
    ref: el => {
      if (el) {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      }
    },
    onInput: e => {
      e.target.style.height = "auto";
      e.target.style.height = e.target.scrollHeight + "px";
    },
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.target.blur();
      }
    },
    onBlur: e => onUpdate(f.id, {
      name: e.target.value || f.name
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "fx-sub"
  }, "חיוב בכל ", f.dueDay, " לחודש · ", fixedFreqLabel(f.frequencyMonths), " · ", !f.onCredit ? "חיוב ישיר" : !f.cardId ? "באשראי (חודש הבא)" : `באשראי · ${(cards.find(c => c.id === f.cardId) || {}).name || "כרטיס לא קיים"}`), f.onCredit && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("select", {
    "aria-label": "כרטיס אשראי",
    value: f.cardId || "",
    onChange: e => onUpdate(f.id, {
      cardId: e.target.value || null
    }),
    style: {
      width: "100%",
      maxWidth: 260,
      height: 38,
      borderRadius: 10,
      border: `1px solid ${COLORS.mist}`,
      background: "#fff",
      fontSize: 14,
      fontFamily: "inherit",
      padding: "0 6px"
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "הגדרה גלובלית (ללא כרטיס)"), cards.map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.name || "כרטיס ללא שם")), f.cardId && !cards.some(c => c.id === f.cardId) && /*#__PURE__*/React.createElement("option", {
    value: f.cardId
  }, "כרטיס לא קיים")), f.cardId && (() => {
    const c = cards.find(x => x.id === f.cardId);
    return !isCardComplete(c) ? /*#__PURE__*/React.createElement("div", {
      role: "alert",
      style: {
        fontSize: 11.5,
        color: "#8a6400",
        background: COLORS.amberLight,
        borderRadius: 8,
        padding: "5px 8px",
        marginTop: 4
      }
    }, "⚠️ ", c ? `חסרות הגדרות חיוב לכרטיס (${cardMissingSettings(c)})` : "הכרטיס לא קיים", " — הסכום לא ישובץ בתחזית עד שיוגדרו") : null;
  })()), (f.effectiveFrom || f.effectiveTo) && /*#__PURE__*/React.createElement("div", {
    className: "fx-sub",
    style: {
      color: COLORS.sage,
      fontWeight: 600
    }
  }, "תוקף: ", f.effectiveFrom ? `מ־${monthLabelOf(f.effectiveFrom)}` : "ללא התחלה", f.effectiveTo ? ` עד ${monthLabelOf(f.effectiveTo)}` : " ללא הגבלה"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setEditingId(editingId === f.id ? null : f.id),
    "aria-expanded": editingId === f.id,
    style: {
      border: "none",
      background: "none",
      color: COLORS.sage,
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      padding: "6px 0",
      minHeight: 32,
      textDecoration: "underline"
    }
  }, editingId === f.id ? "סגירת עריכת תוקף" : "תוקף ושינוי סכום"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setExpandedId(null);
      setEditingId(null);
    },
    "aria-label": "סגירת פרטים",
    style: {
      border: "none",
      background: "none",
      color: COLORS.sub,
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      padding: "6px 12px",
      minHeight: 32
    }
  }, "▴ סגירה"))), /*#__PURE__*/React.createElement("button", {
    className: "fx-del",
    onClick: () => {
      if (window.confirm(`למחוק את ההוצאה הקבועה "${f.name}" (${fmt(f.amount)})?\n\nהיא תיעלם מהתחזית.`)) onRemove(f.id);
    },
    title: "מחיקה",
    "aria-label": "מחיקה"
  }, "🗑"), /*#__PURE__*/React.createElement("div", {
    className: "fx-controls"
  }, /*#__PURE__*/React.createElement("label", {
    className: "fx-ctl fx-amount"
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "decimal",
    "aria-label": "סכום",
    defaultValue: f.amount,
    onBlur: e => onUpdate(f.id, {
      amount: round2(e.target.value)
    })
  }), /*#__PURE__*/React.createElement("span", null, "₪")), /*#__PURE__*/React.createElement("select", {
    className: "fx-ctl fx-freq",
    "aria-label": "תדירות",
    value: String(f.frequencyMonths || 1),
    onChange: e => onUpdate(f.id, {
      frequencyMonths: Number(e.target.value),
      anchorMonth: f.anchorMonth || mKey
    })
  }, /*#__PURE__*/React.createElement("option", {
    value: "1"
  }, "חודשי"), /*#__PURE__*/React.createElement("option", {
    value: "2"
  }, "דו-חודשי"), /*#__PURE__*/React.createElement("option", {
    value: "12"
  }, "שנתי")), /*#__PURE__*/React.createElement("button", {
    className: "fx-ctl fx-credit",
    onClick: () => onUpdate(f.id, {
      onCredit: !f.onCredit
    }),
    title: "חיוב באשראי",
    "aria-pressed": !!f.onCredit,
    style: {
      borderColor: f.onCredit ? COLORS.sage : COLORS.mist,
      background: f.onCredit ? COLORS.sageLight : "#fff"
    }
  }, "💳 ", f.onCredit ? "אשראי" : "ישיר")), editingId === f.id && /*#__PURE__*/React.createElement(FixedPeriodPanel, {
    f: f,
    mKey: mKey,
    siblings: f.seriesId ? fixedExpenses.filter(x => x.seriesId === f.seriesId && x.id !== f.id && x.active !== false) : [],
    onUpdate: onUpdate,
    onSplit: onSplit,
    onClose: () => setEditingId(null)
  }));
  const renderFixedRow = (f, i, list) => {
    if (expandedId === f.id) return renderFixedFull(f, i, list);
    const card = f.cardId ? cards.find(x => x.id === f.cardId) : null;
    const warn = f.onCredit && f.cardId && !isCardComplete(card);
    return /*#__PURE__*/React.createElement("button", {
      key: f.id,
      className: "fx-compact",
      onClick: () => setExpandedId(f.id),
      "aria-expanded": "false",
      style: {
        borderBottom: i === list.length - 1 ? "none" : `1px solid ${COLORS.mist}`
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "fx-day"
    }, f.dueDay), /*#__PURE__*/React.createElement("span", {
      className: "fx-cname"
    }, f.name, (f.frequencyMonths || 1) > 1 ? /*#__PURE__*/React.createElement("small", null, " · ", fixedFreqLabel(f.frequencyMonths)) : null, f.effectiveFrom || f.effectiveTo ? /*#__PURE__*/React.createElement("small", null, " · תוקף מוגבל") : null), /*#__PURE__*/React.createElement("span", {
      className: "fx-camt"
    }, warn ? "⚠️ " : "", f.onCredit ? "💳 " : "", fmt(f.amount)), /*#__PURE__*/React.createElement("span", {
      className: "fx-chev"
    }, "▾"));
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 15,
      margin: "6px 2px 10px"
    }
  }, "הוצאות קבועות"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 14
    }
  }, active.length === 0 && ended.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 18,
      textAlign: "center",
      color: COLORS.sub,
      fontSize: 13
    }
  }, "עדיין לא הוגדרו הוצאות קבועות"), active.map((f, i) => renderFixedRow(f, i, active))), ended.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowEnded(v => !v),
    "aria-expanded": showEnded,
    style: {
      border: "none",
      background: "none",
      fontSize: 13,
      fontWeight: 700,
      color: COLORS.sub,
      cursor: "pointer",
      minHeight: 40,
      padding: "0 2px"
    }
  }, showEnded ? "▴" : "▾", " הוצאות שהסתיימו לפני ", monthLabelOf(mKey), " (", ended.length, ")"), showEnded && /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      overflow: "hidden",
      opacity: 0.9
    }
  }, ended.map((f, i) => renderFixedRow(f, i, ended)))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: COLORS.sub,
      margin: "-8px 2px 12px"
    }
  }, "💳 = ההוצאה מחויבת באשראי ותשתקף בתחזית בחודש שאחרי, לא בחודש בו היא בוצעה"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      padding: "0 4px 14px",
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.sub
    }
  }, "סה\"כ הוצאות קבועות ב", monthLabelOf(mKey)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800,
      fontFamily: "Heebo, sans-serif"
    }
  }, fmt(total))), !adding ? /*#__PURE__*/React.createElement("button", {
    onClick: () => setAdding(true),
    style: {
      width: "100%",
      padding: "12px",
      borderRadius: 12,
      border: `1.5px dashed ${COLORS.sage}`,
      background: "none",
      color: COLORS.sage,
      fontWeight: 700,
      fontSize: 13.5,
      cursor: "pointer"
    }
  }, "＋ הוספת הוצאה קבועה") : /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "שם"), /*#__PURE__*/React.createElement("input", {
    placeholder: "למשל: משכנתא",
    value: name,
    onChange: e => setName(e.target.value),
    style: {
      ...inputStyle,
      marginBottom: 10
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "סכום"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    placeholder: "0",
    value: amount,
    onChange: e => setAmount(e.target.value),
    style: inputStyle
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 90
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "יום חיוב"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    max: "31",
    value: dueDay,
    onChange: e => setDueDay(e.target.value),
    style: inputStyle
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement(MonthPicker, {
    label: "החל מחודש (לא חובה)",
    value: fromM,
    onChange: setFromM,
    allowEmpty: true
  }), /*#__PURE__*/React.createElement(MonthPicker, {
    label: "עד חודש (לא חובה)",
    value: toM,
    onChange: setToM,
    allowEmpty: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setAddCredit(v => !v),
    "aria-pressed": addCredit,
    style: {
      minHeight: 40,
      padding: "0 12px",
      borderRadius: 10,
      border: `1.5px solid ${addCredit ? COLORS.sage : COLORS.mist}`,
      background: addCredit ? COLORS.sageLight : "#fff",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "💳 חיוב באשראי ", addCredit ? "✓" : ""), addCredit && /*#__PURE__*/React.createElement("select", {
    "aria-label": "כרטיס אשראי",
    value: addCard,
    onChange: e => setAddCard(e.target.value),
    style: {
      ...selectStyle,
      marginTop: 8,
      width: "100%",
      height: 40,
      fontSize: 16
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "הגדרה גלובלית (ללא כרטיס)"), cards.map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.name || "כרטיס ללא שם")))), addErr && /*#__PURE__*/React.createElement("div", {
    role: "alert",
    style: {
      color: COLORS.coral,
      fontSize: 12.5,
      fontWeight: 600,
      marginBottom: 8
    }
  }, addErr), /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "תדירות"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 12
    }
  }, [["1", "חודשי"], ["2", "דו-חודשי (כמו חשמל/מים)"], ["12", "שנתי (כמו ביטוח רכב ורישיון)"]].map(([val, lbl]) => /*#__PURE__*/React.createElement("button", {
    key: val,
    onClick: () => setFreq(val),
    style: {
      flex: 1,
      padding: "9px 6px",
      borderRadius: 10,
      border: `1.5px solid ${freq === val ? COLORS.sage : COLORS.mist}`,
      background: freq === val ? COLORS.sageLight : "#fff",
      fontSize: 12.5,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, lbl))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: reset,
    style: {
      flex: 1,
      padding: "10px",
      borderRadius: 10,
      border: `1px solid ${COLORS.mist}`,
      background: "#fff",
      cursor: "pointer",
      fontSize: 13
    }
  }, "ביטול"), /*#__PURE__*/React.createElement("button", {
    disabled: !name.trim() || !Number(amount),
    onClick: () => {
      const dv = Number(dueDay);
      const dayErr = !Number.isInteger(dv) || dv < 1 || dv > 31 ? "היום בחודש חייב להיות מספר שלם בין 1 ל־31" : "";
      const e = dayErr || validateFixedPeriod(fromM, toM, []);
      if (e) return setAddErr(e);
      onAdd(name.trim(), round2(amount), dv, Number(freq), mKey, fromM || null, toM || null, addCredit, addCard || null);
      reset();
    },
    style: {
      flex: 1,
      padding: "10px",
      borderRadius: 10,
      border: "none",
      background: COLORS.sage,
      color: "#fff",
      fontWeight: 700,
      cursor: "pointer",
      fontSize: 13
    }
  }, "שמירה"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 15,
      margin: "22px 2px 10px"
    }
  }, "הוצאות מתוכננות (חד-פעמיות)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: COLORS.sub,
      marginBottom: 10
    }
  }, "הוצאה עתידית בתאריך ידוע — תשתקף בטאב התחזית בחודש הרלוונטי"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 14
    }
  }, upcomingPlanned.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 18,
      textAlign: "center",
      color: COLORS.sub,
      fontSize: 13
    }
  }, "אין הוצאות מתוכננות קרובות"), upcomingPlanned.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "11px 14px",
      borderBottom: i === upcomingPlanned.length - 1 ? "none" : `1px solid ${COLORS.mist}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18
    }
  }, "📌"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      fontWeight: 600
    }
  }, p.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: COLORS.sub
    }
  }, p.date.split("-").reverse().join("/"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13.5
    }
  }, fmt(p.amount)), /*#__PURE__*/React.createElement("button", {
    onClick: () => onRemovePlanned(p.id),
    style: {
      ...iconBtnStyle,
      color: COLORS.coral
    }
  }, "🗑")))), pastPlanned.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowPastPlanned(v => !v),
    "aria-expanded": showPastPlanned,
    style: {
      border: "none",
      background: "none",
      fontSize: 13,
      fontWeight: 700,
      color: COLORS.sub,
      cursor: "pointer",
      minHeight: 40,
      padding: "0 2px"
    }
  }, showPastPlanned ? "▴" : "▾", " מתוכננות שעברו (", pastPlanned.length, ")"), showPastPlanned && /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      overflow: "hidden",
      opacity: 0.9
    }
  }, pastPlanned.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "11px 14px",
      borderBottom: i === pastPlanned.length - 1 ? "none" : `1px solid ${COLORS.mist}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18
    }
  }, "📌"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      fontWeight: 600
    }
  }, p.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: COLORS.sub
    }
  }, plannedDateOk(p) ? p.date.split("-").reverse().join("/") : "ללא תאריך")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13.5
    }
  }, fmt(p.amount)), /*#__PURE__*/React.createElement("button", {
    onClick: () => onRemovePlanned(p.id),
    "aria-label": "מחיקת " + (p.name || "הוצאה מתוכננת"),
    style: {
      ...iconBtnStyle,
      color: COLORS.coral
    }
  }, "🗑"))))), !addingPlanned ? /*#__PURE__*/React.createElement("button", {
    onClick: () => setAddingPlanned(true),
    style: {
      width: "100%",
      padding: "12px",
      borderRadius: 12,
      border: `1.5px dashed ${COLORS.sage}`,
      background: "none",
      color: COLORS.sage,
      fontWeight: 700,
      fontSize: 13.5,
      cursor: "pointer"
    }
  }, "＋ הוספת הוצאה מתוכננת") : /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      padding: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "שם"), /*#__PURE__*/React.createElement("input", {
    placeholder: "למשל: טיסה, תיקון רכב",
    value: pName,
    onChange: e => setPName(e.target.value),
    style: {
      ...inputStyle,
      marginBottom: 10
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "סכום"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    placeholder: "0",
    value: pAmount,
    onChange: e => setPAmount(e.target.value),
    style: inputStyle
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "תאריך"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: pDate,
    onChange: e => setPDate(e.target.value),
    style: inputStyle
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: resetPlanned,
    style: {
      flex: 1,
      padding: "10px",
      borderRadius: 10,
      border: `1px solid ${COLORS.mist}`,
      background: "#fff",
      cursor: "pointer",
      fontSize: 13
    }
  }, "ביטול"), /*#__PURE__*/React.createElement("button", {
    disabled: !pName.trim() || !Number(pAmount) || !/^\d{4}-\d{2}-\d{2}$/.test(pDate || ""),
    onClick: () => {
      onAddPlanned(pName.trim(), Number(pAmount), pDate);
      resetPlanned();
    },
    style: {
      flex: 1,
      padding: "10px",
      borderRadius: 10,
      border: "none",
      background: COLORS.sage,
      color: "#fff",
      fontWeight: 700,
      cursor: "pointer",
      fontSize: 13
    }
  }, "שמירה"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80
    }
  }));
}

/* ================= RECURRING INCOMES ================= */
function RecurringIncomeForm({
  initial,
  onSubmit,
  onCancel
}) {
  const i = initial || {};
  const [f, setF] = useState({
    name: i.name || "",
    amount: isEmptyVal(i.amount) ? "" : String(i.amount),
    day: isEmptyVal(i.day) ? "" : String(i.day),
    startMonth: i.startMonth || "",
    endMonth: i.endMonth || "",
    bonusAmount: isEmptyVal(i.bonusAmount) ? "" : String(i.bonusAmount),
    bonusEveryMonths: isEmptyVal(i.bonusEveryMonths) ? "" : String(i.bonusEveryMonths),
    bonusAnchorMonth: i.bonusAnchorMonth || ""
  });
  const [err, setErr] = useState("");
  const set = k => v => setF(p => ({
    ...p,
    [k]: v
  }));
  const inp = {
    ...inputStyle,
    height: 40,
    fontSize: 16
  };
  const submit = () => {
    const e = validateRecurringIncome(f);
    if (e) return setErr(e);
    const out = {
      id: i.id || uid(),
      name: f.name.trim(),
      amount: Number(f.amount),
      day: Number(f.day),
      startMonth: f.startMonth
    };
    if (!isEmptyVal(f.endMonth)) out.endMonth = f.endMonth;
    if (!isEmptyVal(f.bonusAmount)) {
      out.bonusAmount = Number(f.bonusAmount);
      out.bonusEveryMonths = Number(f.bonusEveryMonths);
      out.bonusAnchorMonth = f.bonusAnchorMonth;
    }
    onSubmit(out);
  };
  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
    marginTop: 10
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.paper,
      borderRadius: 12,
      padding: 12,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "שם ההכנסה"), /*#__PURE__*/React.createElement("input", {
    "aria-label": "שם ההכנסה",
    value: f.name,
    onChange: e => set("name")(e.target.value),
    placeholder: "למשל: משכורת",
    style: inp
  }), /*#__PURE__*/React.createElement("div", {
    style: grid
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "סכום רגיל (₪)"), /*#__PURE__*/React.createElement("input", {
    "aria-label": "סכום רגיל",
    type: "number",
    inputMode: "decimal",
    min: "0",
    value: f.amount,
    onChange: e => set("amount")(e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "יום בחודש"), /*#__PURE__*/React.createElement("input", {
    "aria-label": "יום בחודש",
    type: "number",
    inputMode: "numeric",
    min: "1",
    max: "31",
    value: f.day,
    onChange: e => set("day")(e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: grid
  }, /*#__PURE__*/React.createElement(MonthPicker, {
    label: "חודש התחלה",
    value: f.startMonth,
    onChange: set("startMonth"),
    allowEmpty: true
  }), /*#__PURE__*/React.createElement(MonthPicker, {
    label: "חודש סיום (לא חובה)",
    value: f.endMonth,
    onChange: set("endMonth"),
    allowEmpty: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 12.5,
      marginTop: 14
    }
  }, "בונוס חוזר (לא חובה, שלושת השדות יחד)"), /*#__PURE__*/React.createElement("div", {
    style: grid
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "סכום בחודש בונוס (₪)"), /*#__PURE__*/React.createElement("input", {
    "aria-label": "סכום בחודש בונוס",
    type: "number",
    inputMode: "decimal",
    min: "0",
    value: f.bonusAmount,
    onChange: e => set("bonusAmount")(e.target.value),
    style: inp
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "כל כמה חודשים"), /*#__PURE__*/React.createElement("input", {
    "aria-label": "תדירות הבונוס בחודשים",
    type: "number",
    inputMode: "numeric",
    min: "1",
    value: f.bonusEveryMonths,
    onChange: e => set("bonusEveryMonths")(e.target.value),
    style: inp
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement(MonthPicker, {
    label: "חודש עוגן לבונוס",
    value: f.bonusAnchorMonth,
    onChange: set("bonusAnchorMonth"),
    allowEmpty: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      marginTop: 6,
      lineHeight: 1.5
    }
  }, "בחודש בונוס הסכום שלו מחליף את הסכום הרגיל (לא מתווסף). חודש העוגן עצמו הוא חודש בונוס, והבונוס חוזר כל N חודשים אחריו ולא לפניו. בחודש קצר ההכנסה נרשמת ביום האחרון."), err && /*#__PURE__*/React.createElement("div", {
    role: "alert",
    style: {
      color: COLORS.coral,
      fontSize: 12.5,
      fontWeight: 600,
      marginTop: 8
    }
  }, err), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onCancel,
    style: {
      flex: 1,
      minHeight: 42,
      borderRadius: 10,
      border: `1px solid ${COLORS.mist}`,
      background: "#fff",
      fontWeight: 700,
      fontSize: 13.5,
      cursor: "pointer"
    }
  }, "ביטול"), /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    style: {
      flex: 1,
      minHeight: 42,
      borderRadius: 10,
      border: "none",
      background: COLORS.sage,
      color: "#fff",
      fontWeight: 700,
      fontSize: 13.5,
      cursor: "pointer"
    }
  }, "שמירה")));
}
function IncomeLinkDialog({
  r,
  incomeEntries,
  recurringIncomes,
  onConfirm,
  onClose
}) {
  const [sel, setSel] = useState([]);
  const cands = incomeEntries.filter(e => !e.recurringIncomeId).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const linkedElsewhere = incomeEntries.filter(e => e.recurringIncomeId);
  const err = sel.length ? validateIncomeLink(r.id, sel, incomeEntries) : "";
  const chosen = cands.filter(e => sel.includes(e.id));
  const toggle = id => setSel(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.paper,
      borderRadius: 12,
      padding: 12,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13
    }
  }, "קישור הכנסות קיימות אל \"", r.name, "\""), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      lineHeight: 1.5,
      margin: "4px 0 8px"
    }
  }, "הקישור משנה רק את שיוך הרשומה (recurringIncomeId), בלי לשנות סכום, שם, תאריך או חודש. רשומה מקושרת מחליפה את ההכנסה הקבועה בחודש שלה. אפשר לבחור גם רשומות בשמות שונים. שום דבר לא מקושר אוטומטית."), cands.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: COLORS.sub
    }
  }, "אין הכנסות ידניות לא מקושרות"), /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: 260,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, cands.map(e => {
    const applies = !!recurringIncomeForMonth(r, e.monthKey);
    return /*#__PURE__*/React.createElement("label", {
      key: e.id,
      style: {
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        background: "#fff",
        borderRadius: 10,
        padding: "8px 10px",
        minHeight: 44,
        cursor: "pointer",
        border: `1.5px solid ${sel.includes(e.id) ? COLORS.sage : COLORS.mist}`
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: sel.includes(e.id),
      onChange: () => toggle(e.id),
      style: {
        width: 20,
        height: 20,
        marginTop: 2,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0,
        fontSize: 13,
        overflowWrap: "anywhere"
      }
    }, /*#__PURE__*/React.createElement("b", null, monthLabelOf(e.monthKey)), " · ", e.source, " · ", fmt(e.amount), applies && /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        fontSize: 11.5,
        color: "#8a6400"
      }
    }, "⚠️ ייתכן כפל: ההכנסה הקבועה חלה גם בחודש הזה. אחרי הקישור הרשומה תחליף אותה ולא תיספר פעמיים")));
  })), linkedElsewhere.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      marginTop: 6
    }
  }, linkedElsewhere.length, " רשומות כבר מקושרות ואינן מוצגות כאן"), chosen.length > 0 && !err && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      background: COLORS.sageLight,
      borderRadius: 10,
      padding: "8px 10px",
      marginTop: 8,
      lineHeight: 1.6
    }
  }, "תצוגה מקדימה: יקושרו ", chosen.length, " רשומות ל\"", r.name, "\":", chosen.map(e => /*#__PURE__*/React.createElement("div", {
    key: e.id
  }, "• ", monthLabelOf(e.monthKey), " · ", fmt(e.amount), " (במקום הסכום הקבוע של החודש הזה)"))), err && /*#__PURE__*/React.createElement("div", {
    role: "alert",
    style: {
      color: COLORS.coral,
      fontSize: 12.5,
      fontWeight: 600,
      marginTop: 8
    }
  }, err), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      flex: 1,
      minHeight: 42,
      borderRadius: 10,
      border: `1px solid ${COLORS.mist}`,
      background: "#fff",
      fontWeight: 700,
      fontSize: 13.5,
      cursor: "pointer"
    }
  }, "סגירה"), /*#__PURE__*/React.createElement("button", {
    disabled: !chosen.length || !!err,
    onClick: () => {
      onConfirm(r.id, sel);
      onClose();
    },
    style: {
      flex: 1,
      minHeight: 42,
      borderRadius: 10,
      border: "none",
      background: COLORS.sage,
      color: "#fff",
      fontWeight: 700,
      fontSize: 13.5,
      cursor: "pointer",
      opacity: !chosen.length || err ? 0.5 : 1
    }
  }, "אישור קישור ", chosen.length ? `(${chosen.length})` : "")));
}
function RecurringIncomesPanel({
  recurringIncomes,
  incomeEntries,
  onSave,
  onLink
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // null | "new" | {edit: id} | {link: id}
  const del = r => {
    const linked = incomeEntries.filter(e => e.recurringIncomeId === r.id).length;
    const msg = `למחוק את ההכנסה הקבועה "${r.name}"?\n\nהיא תיעלם מהתחזית בכל החודשים.${linked ? `\n${linked} רשומות ידניות מקושרות אליה לא יימחקו וימשיכו להיספר כהכנסות רגילות בחודשים שלהן.` : ""}`;
    if (window.confirm(msg)) onSave(recurringIncomes.filter(x => x.id !== r.id));
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 14,
      padding: "6px 14px",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(o => !o),
    "aria-expanded": open,
    style: {
      width: "100%",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      border: "none",
      background: "none",
      minHeight: 44,
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
      color: COLORS.ink,
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("span", null, "💰 הכנסות קבועות (", recurringIncomes.length, ")"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.sub,
      fontSize: 12
    }
  }, open ? "סגירה ▴" : "פתיחה ▾")), open && /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      lineHeight: 1.5,
      marginBottom: 8
    }
  }, "הכנסה קבועה ממלאת את התחזית בכל חודש רלוונטי. כדי לשנות חודש מסוים אפשר ללחוץ \"שנה לחודש זה\" בתוך החודש בתחזית."), recurringIncomes.map(r => {
    const dupes = incomeEntries.filter(e => !e.recurringIncomeId && recurringIncomeForMonth(r, e.monthKey)).length;
    return /*#__PURE__*/React.createElement("div", {
      key: r.id,
      style: {
        borderTop: `1px solid ${COLORS.mist}`,
        padding: "10px 0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 14,
        overflowWrap: "anywhere"
      }
    }, r.name, " · ", fmt(r.amount)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: COLORS.sub,
        lineHeight: 1.5
      }
    }, "יום ", r.day, " בחודש · מ־", monthLabelOf(r.startMonth), r.endMonth ? ` עד ${monthLabelOf(r.endMonth)}` : " ללא סיום", !isEmptyVal(r.bonusAmount) && /*#__PURE__*/React.createElement("div", null, "בונוס: ", fmt(r.bonusAmount), " כל ", r.bonusEveryMonths, " חודשים, החל מ־", monthLabelOf(r.bonusAnchorMonth), " (מחליף את הסכום הרגיל)")), dupes > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "#8a6400",
        background: COLORS.amberLight,
        borderRadius: 8,
        padding: "5px 8px",
        marginTop: 6
      }
    }, "⚠️ יש ", dupes, " הכנסות ידניות לא מקושרות בחודשים שההכנסה הזו חלה בהם. ייתכן כפל; אפשר לקשר אותן ידנית."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 8
      }
    }, [["עריכה", () => setMode({
      edit: r.id
    })], ["קישור רשומות", () => setMode({
      link: r.id
    })], ["מחיקה", () => del(r)]].map(([t, fn]) => /*#__PURE__*/React.createElement("button", {
      key: t,
      onClick: fn,
      style: {
        minHeight: 40,
        padding: "0 12px",
        borderRadius: 10,
        border: `1px solid ${COLORS.mist}`,
        background: "#fff",
        color: t === "מחיקה" ? COLORS.coral : COLORS.ink,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer"
      }
    }, t))), mode && mode.edit === r.id && /*#__PURE__*/React.createElement(RecurringIncomeForm, {
      initial: r,
      onCancel: () => setMode(null),
      onSubmit: out => {
        onSave(recurringIncomes.map(x => x.id === r.id ? out : x));
        setMode(null);
      }
    }), mode && mode.link === r.id && /*#__PURE__*/React.createElement(IncomeLinkDialog, {
      r: r,
      incomeEntries: incomeEntries,
      recurringIncomes: recurringIncomes,
      onConfirm: onLink,
      onClose: () => setMode(null)
    }));
  }), mode === "new" ? /*#__PURE__*/React.createElement(RecurringIncomeForm, {
    onCancel: () => setMode(null),
    onSubmit: out => {
      onSave([...recurringIncomes, out]);
      setMode(null);
    }
  }) : /*#__PURE__*/React.createElement("button", {
    onClick: () => setMode("new"),
    style: {
      width: "100%",
      minHeight: 44,
      borderRadius: 12,
      border: `1.5px dashed ${COLORS.sage}`,
      background: "none",
      color: COLORS.sage,
      fontWeight: 700,
      fontSize: 13.5,
      cursor: "pointer",
      marginTop: 6
    }
  }, "＋ הוספת הכנסה קבועה")));
}

/* ================= FORECAST TAB ================= */
function ForecastTab({
  monthDate,
  totalBudget,
  fixedExpenses,
  plannedExpenses,
  incomeEntries,
  onAddIncome,
  onRemoveIncome,
  budgets,
  categories,
  creditLag,
  onToggleCreditLag,
  openingBalance,
  onSetOpeningBalance,
  openingBalanceDate,
  onSetOpeningBalanceDate,
  creditBillingDay,
  onSetCreditBillingDay,
  variableOverrides,
  onSetVariableOverride,
  variableOverrideMeta,
  onSetVariableOverrideMeta,
  cards,
  onSaveCards,
  recurringIncomes,
  onSaveRecurring,
  onAddOverride,
  onLinkEntries,
  cashBudgets
}) {
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
    if (parts.length !== 3 || parts.some(x => !Number.isFinite(x))) return null;
    const [y, mo, da] = parts;
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    const key = `${y}-${String(mo).padStart(2, "0")}`;
    return {
      key,
      day: da,
      past: key < realNowKey,
      unsupported: monthsDiff(key, realNowKey) > 3,
      dateLabel: `${String(da).padStart(2, "0")}.${String(mo).padStart(2, "0")}.${y}`
    };
  }, [openingBalanceDate, realNowKey]);
  const months = useMemo(() => {
    const arr = [];
    const start = anchorInfo && !anchorInfo.unsupported && anchorInfo.key < viewedKey ? -monthsDiff(anchorInfo.key, viewedKey) : 0;
    for (let i = start; i <= 6; i++) {
      const d = new Date(monthDate.getFullYear(), monthDate.getMonth() + i, 1);
      arr.push({
        key: monthKey(d),
        label: `${HEBREW_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        offset: i
      });
    }
    return arr;
  }, [monthDate, anchorInfo, viewedKey]);
  const rowsRaw = months.map(m => {
    const isAnchorMonth = !!(anchorInfo && !anchorInfo.unsupported && m.key === anchorInfo.key);
    const fromDay = isAnchorMonth ? anchorInfo.day : 1;
    // יום בחודש תמיד בתחום החודש בפועל (למשל יום 31 בספטמבר מוצג כ־30), גם בסינון וגם בתצוגה.
    const dim = daysInMonthKey(m.key);
    const clampDay = d => Math.min(Number(d) || 1, dim);
    const inRange = d => clampDay(d) >= fromDay;
    const entries = incomeEntries.filter(e => e.monthKey === m.key && inRange(e.day));
    const recInfoFull = recurringIncomeItemsForMonth(recurringIncomes, incomeEntries, m.key);
    const recInfo = {
      ...recInfoFull,
      items: recInfoFull.items.filter(x => inRange(x.day))
    };
    const recurringTotal = recInfo.items.reduce((s, x) => s + x.amount, 0);
    const income = entries.reduce((s, e) => s + Number(e.amount || 0), 0) + recurringTotal;
    const {
      direct: directFixedAll,
      creditFromPrev: creditFixed
    } = fixedForecastItemsForMonth(fixedExpenses, m.key);
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
    const ovrMeta = hasOverride ? (variableOverrideMeta || {})[m.key] || null : null;
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
    entries.forEach(e => events.push({
      day: clampDay(e.day),
      label: `💰 ${e.source}${e.recurringIncomeId ? " · עוקף קבועה" : ""}`,
      amount: Number(e.amount) || 0
    }));
    recInfo.items.forEach(x => events.push({
      day: clampDay(x.day),
      label: `💰 ${x.r.name} · קבועה${x.bonus ? " · בונוס" : ""}`,
      amount: x.amount
    }));
    directFixed.forEach(f => events.push({
      day: clampDay(f.dueDay),
      label: `📎 ${f.name}${f.effectiveTo === m.key ? " · חודש אחרון" : ""}`,
      amount: -(Number(f.amount) || 0)
    }));
    plannedForMonth.forEach(p => events.push({
      day: Number(p.date.split("-")[2]) || 1,
      label: `📌 ${p.name}`,
      amount: -(Number(p.amount) || 0)
    }));
    if (includeGlobalCredit && globalCredit > 0) {
      const ovrStatusLabel = ovrMeta && ovrMeta.status === "partial" ? " · חלקי" : ovrMeta && ovrMeta.status === "final" ? " · סופי" : "";
      const label = hasOverride ? `💳 חיוב אשראי (ידני)${ovrStatusLabel}` : `💳 חיוב אשראי (${fmt(creditFixedTotal)} קבועות + ${fmt(autoVariableCredit)} משתנה באשראי)`;
      events.push({
        day: clampDay(creditBillingDay),
        label,
        amount: -globalCredit
      });
    }
    cardLines.forEach(cl => events.push({
      day: clampDay(cl.day),
      label: `💳 ${cl.card.name || "כרטיס"} · הערכה לפי הגדרות הכרטיס (${cl.items.length} הוצאות)`,
      amount: -cl.total
    }));
    events.sort((a, b) => a.day - b.day || b.amount - a.amount);
    const keep = !anchorInfo ? m.offset >= 1 : anchorInfo.unsupported ? false : m.key >= anchorInfo.key;
    return {
      ...m,
      isAnchorMonth,
      fromDay,
      entries,
      income,
      directFixedTotal,
      creditFixedTotal,
      autoVariableSpend,
      sourceMonthKey,
      sourceCash,
      autoVariableCredit,
      cashRaw,
      cashDirect,
      cashAnchorPartial,
      cashAnchorDays,
      dimDays: dim,
      creditLump,
      plannedForMonth,
      plannedTotal,
      hasOverride,
      ovrMeta,
      balance,
      recInfo,
      globalCredit,
      cardLines,
      cardTotal,
      unscheduled,
      partial,
      events,
      keep
    };
  }).filter(r => r.keep);
  let running = Number(openingBalance) || 0;
  let runPartial = false;
  const rows = rowsRaw.map(r => {
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
      if (bal < minBal) {
        minBal = bal;
        minDay = ev.day;
      }
      bal += ev.amount;
      prevDay = ev.day;
      if (bal < minBal) {
        minBal = bal;
        minDay = ev.day;
      }
      return {
        ...ev,
        after: bal
      };
    });
    bal -= cashPerDay * (r.dimDays - prevDay);
    if (bal < minBal) {
      minBal = bal;
      minDay = r.dimDays;
    }
    // שורת סגירה: כשהפיזור היומי של המזומן ממשיך אחרי האירוע המתוארך האחרון, מציגים את ההשלמה כדי שהתזרים יסתדר עם יתרת סוף החודש
    const cashTail = cashPerDay * (r.dimDays - prevDay);
    if (cashTail > 0.004) {
      timeline.push({
        day: r.dimDays,
        label: `🏁 סוף חודש · יתרה משוערת אחרי פיזור מזומן/ביט (השלמת ${fmt(cashTail)})`,
        amount: -cashTail,
        after: bal,
        closing: true
      });
    }
    running += r.balance;
    return {
      ...r,
      openingForMonth,
      running,
      timeline,
      minBal,
      minDay,
      runPartial
    };
  });
  const addIncomeHere = mKey => {
    if (!srcDraft.trim() || !Number(amtDraft)) return;
    onAddIncome(mKey, srcDraft.trim(), Number(amtDraft), Number(dayDraft) || 1);
    setSrcDraft("");
    setAmtDraft("");
    setDayDraft("1");
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "6px 2px 4px",
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 15
    }
  }, "תחזית 6 חודשים"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: COLORS.sub,
      marginBottom: 12
    }
  }, "לחיצה על חודש בטבלה פותחת את הפירוט היומי המלא, כולל הנקודה הנמוכה בחודש"), anchorInfo && anchorInfo.unsupported && /*#__PURE__*/React.createElement("div", {
    role: "alert",
    style: {
      background: COLORS.amberLight,
      color: "#8a6400",
      borderRadius: 12,
      padding: "10px 12px",
      fontSize: 12.5,
      fontWeight: 600,
      marginBottom: 10,
      lineHeight: 1.5
    }
  }, "⚠️ תאריך היתרה ישן מדי לחישוב אמין (יותר מ־3 חודשים אחורה), והתחזית לא מוצגת. עדכנו יתרה ותאריך עדכניים, או נקו את שדה התאריך כדי לחזור לחישוב הרגיל."), anchorInfo && !anchorInfo.unsupported && anchorInfo.past && /*#__PURE__*/React.createElement("div", {
    role: "note",
    style: {
      background: COLORS.amberLight,
      color: "#8a6400",
      borderRadius: 12,
      padding: "10px 12px",
      fontSize: 12.5,
      fontWeight: 600,
      marginBottom: 10,
      lineHeight: 1.5
    }
  }, "ℹ️ תאריך היתרה לפני החודש הנוכחי. התנועות שבין התאריך להיום מחושבות רק מנתוני התכנון באפליקציה (הכנסות והוצאות מתוכננות), בלי תנועות בנק בפועל. אם היו תנועות נוספות, עדכנו יתרה ותאריך עדכניים."), anchorInfo && !anchorInfo.unsupported && rows.length === 0 && /*#__PURE__*/React.createElement("div", {
    role: "note",
    style: {
      background: COLORS.amberLight,
      color: "#8a6400",
      borderRadius: 12,
      padding: "10px 12px",
      fontSize: 12.5,
      fontWeight: 600,
      marginBottom: 10,
      lineHeight: 1.5
    }
  }, "ℹ️ תאריך היתרה שנבחר מאוחר מתקופת התחזית. בחרו תאריך מוקדם יותר או נקו את שדה התאריך."), (rows.some(r => r.partial) || rows.some(r => r.minBal < 0)) && (() => {
    const negRows = rows.filter(r => r.minBal < 0);
    const crossRows = negRows.filter(r => r.openingForMonth >= 0);
    const deepRows = negRows.filter(r => r.openingForMonth < 0 && r.minBal < r.openingForMonth);
    const anyPartial = rows.some(r => r.partial);
    const worst = negRows.reduce((a, b) => b.minBal < a.minBal ? b : a, negRows[0] || null);
    const dipSummary = crossRows.length === 1 && deepRows.length === 0 ? `${crossRows[0].label}: ירידה צפויה למינוס, עד ${fmt(crossRows[0].minBal)} ביום ${crossRows[0].minDay}` : crossRows.length > 0 ? `ירידה צפויה למינוס ב${crossRows[0].label} · הנמוכה ביותר: ${worst.label}, עד ${fmt(worst.minBal)} ביום ${worst.minDay}` : deepRows.length > 0 ? `המינוס מעמיק · הנמוכה ביותר: ${worst.label}, עד ${fmt(worst.minBal)} ביום ${worst.minDay}` : "";
    const partialSummary = anyPartial ? "חלק מהיתרות חלקיות (יש סכומים שטרם שובצו לתזרים)" : "";
    return /*#__PURE__*/React.createElement("div", {
      style: {
        background: COLORS.amberLight,
        borderRadius: 12,
        padding: "4px 12px",
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setWarnOpen(o => !o),
      "aria-expanded": warnOpen,
      style: {
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        border: "none",
        background: "none",
        cursor: "pointer",
        minHeight: 40,
        padding: 0,
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: 700,
        color: negRows.length ? COLORS.coral : "#8a6400",
        textAlign: "right",
        lineHeight: 1.5
      }
    }, /*#__PURE__*/React.createElement("span", null, "⚠️ ", [dipSummary, partialSummary].filter(Boolean).join(" · ")), /*#__PURE__*/React.createElement("span", {
      style: {
        flexShrink: 0,
        fontSize: 11,
        color: "#8a6400",
        fontWeight: 600
      }
    }, warnOpen ? "סגירה ▴" : "פירוט ▾")), warnOpen && /*#__PURE__*/React.createElement("div", {
      role: "alert",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        paddingBottom: 10,
        fontSize: 12.5,
        fontWeight: 600,
        color: "#8a6400",
        lineHeight: 1.6
      }
    }, anyPartial && /*#__PURE__*/React.createElement("div", null, "⚠️ חלק מהיתרות חלקיות: יש הוצאות קבועות באשראי של כרטיסים שטרם הוגדר להם יום חיוב או חודש חיוב. הסכומים מוצגים בנפרד בפירוט החודש (\"טרם שובץ לתזרים\") ואינם כלולים ביתרה."), negRows.map(r => /*#__PURE__*/React.createElement("div", {
      key: r.key,
      style: {
        color: COLORS.coral
      }
    }, "⚠️ ", r.label, ": ", r.openingForMonth >= 0 ? "ירידה צפויה למינוס" : r.minBal < r.openingForMonth ? "המינוס מעמיק" : "היתרה במינוס", " עד ", fmt(r.minBal), " ביום ", r.minDay, " לחודש", r.runPartial ? " (חלקי)" : "", r.openingForMonth >= 0 ? " — לפני שהיא מתאזנת בסוף החודש" : ""))));
  })(), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: COLORS.sub,
      margin: "0 2px 8px",
      lineHeight: 1.5
    }
  }, openingBalanceDate && anchorInfo ? `היתרות משוערות על בסיס יתרת פתיחה ${fmt(openingBalance)} נכון ל־${anchorInfo.dateLabel} ולא אומתו מול הבנק` : `היתרות משוערות בלבד: יתרת הפתיחה (${fmt(openingBalance)}) הוזנה ללא תאריך ולא אומתה מול הבנק. עיגון לתאריך זמין בהגדרות התחזית`), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      padding: "4px 12px 8px",
      marginBottom: 14,
      boxShadow: "0 2px 10px rgba(20,33,61,0.04)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 2px",
      fontSize: 11,
      fontWeight: 700,
      color: COLORS.sub,
      borderBottom: `1px solid ${COLORS.mist}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, "חודש"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 80,
      textAlign: "left",
      flexShrink: 0
    }
  }, "שינוי חודשי"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 92,
      textAlign: "left",
      flexShrink: 0
    }
  }, "יתרה משוערת"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      flexShrink: 0
    }
  })), rows.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.key,
    style: {
      borderBottom: `1px solid ${COLORS.mist}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => setExpandedMonth(expandedMonth === r.key ? null : r.key),
    role: "button",
    "aria-expanded": expandedMonth === r.key,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      cursor: "pointer",
      minHeight: 48,
      padding: "7px 2px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 13.5
    }
  }, r.label, r.isAnchorMonth && anchorInfo ? ` · מ־${anchorInfo.day} בחודש` : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginTop: 3,
      flexWrap: "wrap"
    }
  }, r.isAnchorMonth && anchorInfo && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      color: COLORS.sage,
      background: COLORS.sageLight,
      borderRadius: 6,
      padding: "2px 6px"
    }
  }, "יתרה מתחילת ", anchorInfo.dateLabel), r.openingForMonth >= 0 && r.minBal < 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      color: COLORS.coral,
      background: COLORS.coralLight,
      borderRadius: 6,
      padding: "2px 6px"
    }
  }, "ירידה למינוס"), r.openingForMonth < 0 && r.minBal < r.openingForMonth && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      color: COLORS.coral,
      background: COLORS.coralLight,
      borderRadius: 6,
      padding: "2px 6px"
    }
  }, "המינוס מעמיק"))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 80,
      textAlign: "left",
      flexShrink: 0,
      fontSize: 12.5,
      fontWeight: 700,
      color: r.balance >= 0 ? COLORS.sage : COLORS.coral
    }
  }, r.balance >= 0 ? "+" : "", fmt(r.balance)), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 92,
      textAlign: "left",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 800,
      fontSize: 15,
      color: r.running >= 0 ? COLORS.sage : COLORS.coral,
      lineHeight: 1.25
    }
  }, fmt(r.running)), r.runPartial && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: "#8a6400"
    }
  }, "חלקי")), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      flexShrink: 0,
      color: COLORS.sub,
      fontSize: 12,
      textAlign: "center"
    }
  }, expandedMonth === r.key ? "▲" : "▼")), expandedMonth === r.key && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 2,
      borderTop: `1px dashed ${COLORS.mist}`,
      paddingTop: 8,
      paddingBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Row, {
    label: "הכנסות",
    value: fmt(r.income)
  }), (r.recInfo.items.length > 0 || r.recInfo.overridden.length > 0) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      margin: "2px 0 6px"
    }
  }, r.recInfo.items.map(x => /*#__PURE__*/React.createElement("div", {
    key: x.r.id,
    style: {
      background: COLORS.sageLight,
      borderRadius: 8,
      padding: "6px 8px",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      overflowWrap: "anywhere",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: COLORS.sage
    }
  }, "קבועה"), x.bonus ? " · בונוס" : "", " · ", x.r.name, " (יום ", x.day, ")"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      whiteSpace: "nowrap"
    }
  }, fmt(x.amount))), ovr && ovr.key === r.key && ovr.rid === x.r.id ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "סכום לחודש זה (₪, 0 = דילוג)"), /*#__PURE__*/React.createElement("input", {
    "aria-label": "סכום לחודש זה",
    type: "number",
    inputMode: "decimal",
    min: "0",
    value: ovr.amount,
    onChange: e => setOvr({
      ...ovr,
      amount: e.target.value,
      err: ""
    }),
    style: {
      ...inputStyle,
      height: 40,
      fontSize: 16
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "יום (לא חובה)"), /*#__PURE__*/React.createElement("input", {
    "aria-label": "יום בחודש",
    type: "number",
    inputMode: "numeric",
    min: "1",
    max: "31",
    placeholder: String(x.day),
    value: ovr.day,
    onChange: e => setOvr({
      ...ovr,
      day: e.target.value,
      err: ""
    }),
    style: {
      ...inputStyle,
      height: 40,
      fontSize: 16
    }
  }))), ovr.err && /*#__PURE__*/React.createElement("div", {
    role: "alert",
    style: {
      color: COLORS.coral,
      fontSize: 12,
      fontWeight: 600,
      marginTop: 6
    }
  }, ovr.err), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOvr(null),
    style: {
      flex: 1,
      minHeight: 40,
      borderRadius: 10,
      border: `1px solid ${COLORS.mist}`,
      background: "#fff",
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer"
    }
  }, "ביטול"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      const d = ovr.day === "" ? null : Number(ovr.day);
      const e = validateIncomeOverride(x.r.id, r.key, ovr.amount, incomeEntries) || (d !== null && (!Number.isInteger(d) || d < 1 || d > 31) ? "היום חייב להיות בין 1 ל־31" : "");
      if (e) return setOvr({
        ...ovr,
        err: e
      });
      onAddOverride(x.r.id, r.key, Number(ovr.amount), d);
      setOvr(null);
    },
    style: {
      flex: 1,
      minHeight: 40,
      borderRadius: 10,
      border: "none",
      background: COLORS.sage,
      color: "#fff",
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer"
    }
  }, "שמירה לחודש זה בלבד"))) : /*#__PURE__*/React.createElement("button", {
    onClick: () => setOvr({
      key: r.key,
      rid: x.r.id,
      amount: "",
      day: "",
      err: ""
    }),
    style: {
      border: "none",
      background: "none",
      color: COLORS.sage,
      fontSize: 12,
      fontWeight: 700,
      textDecoration: "underline",
      cursor: "pointer",
      minHeight: 32,
      padding: 0,
      marginTop: 2
    }
  }, "שנה לחודש זה"))), r.recInfo.overridden.map(o => /*#__PURE__*/React.createElement("div", {
    key: o.r.id,
    style: {
      background: COLORS.amberLight,
      color: "#8a6400",
      borderRadius: 8,
      padding: "6px 8px",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("b", null, "עוקף קבועה"), " · ", o.r.name, ": ", fmt(o.entry.amount), " במקום ", fmt(o.calc.amount), o.calc.bonus ? " (בונוס)" : ""))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.paper,
      borderRadius: 10,
      padding: "8px 10px",
      margin: "4px 0 8px"
    }
  }, !r.hasOverride && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 13.5,
      fontWeight: 800
    }
  }, /*#__PURE__*/React.createElement("span", null, "📎 הוצאות קבועות"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.coral
    }
  }, "-", fmt(r.directFixedTotal + r.cardLines.reduce((t, c) => t + c.total, 0) + r.creditFixedTotal))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: COLORS.sub,
      lineHeight: 1.7,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", null, "· חיוב ישיר מהבנק"), /*#__PURE__*/React.createElement("span", null, fmt(r.directFixedTotal))), r.cardLines.map(cl => /*#__PURE__*/React.createElement("div", {
    key: cl.card.id,
    style: {
      display: "flex",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", null, "· 💳 ", cl.card.name || "כרטיס", " (יום ", cl.day, ")"), /*#__PURE__*/React.createElement("span", null, fmt(cl.total)))), r.creditFixedTotal > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", null, "· 💳 קבועות באשראי ללא כרטיס משויך"), /*#__PURE__*/React.createElement("span", null, fmt(r.creditFixedTotal)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 13.5,
      fontWeight: 800,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, "🛒 הוצאות משתנות (תקציב)"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.coral
    }
  }, "-", fmt(r.cashDirect + r.autoVariableCredit))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: COLORS.sub,
      lineHeight: 1.7,
      marginTop: 2
    }
  }, r.cashDirect > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", null, "· מזומן/ביט (יורד מהבנק באותו חודש)"), /*#__PURE__*/React.createElement("span", null, fmt(r.cashDirect))), r.autoVariableCredit > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", null, "· באשראי (בתוך החיוב הגלובלי למטה)"), /*#__PURE__*/React.createElement("span", null, fmt(r.autoVariableCredit))))), r.hasOverride && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 13.5,
      fontWeight: 800
    }
  }, /*#__PURE__*/React.createElement("span", null, "📎 קבועות בחיוב ישיר"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.coral
    }
  }, "-", fmt(r.directFixedTotal))), r.cashDirect > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 13.5,
      fontWeight: 800,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", null, "🛒 משתנות במזומן/ביט"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.coral
    }
  }, "-", fmt(r.cashDirect))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 13.5,
      fontWeight: 800,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", null, "💳 אשראי (ידני)"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.coral
    }
  }, "-", fmt(r.creditLump))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: COLORS.sub,
      lineHeight: 1.6,
      marginTop: 2
    }
  }, "הסכום האשראי הידני כולל קבועות ומשתנות יחד, ללא פירוט; ניתן לעריכה ולסימון חלקי/סופי למטה"))), r.cashAnchorPartial && /*#__PURE__*/React.createElement("div", {
    role: "note",
    style: {
      fontSize: 12,
      color: "#8a6400",
      background: COLORS.amberLight,
      borderRadius: 8,
      padding: "6px 8px",
      margin: "4px 0",
      lineHeight: 1.5
    }
  }, "ℹ️ קניות במזומן/ביט: נספרים ", fmt(r.cashDirect), " מתוך ", fmt(r.cashRaw), ", הערכה לפי פיזור שווה מה־", r.fromDay, " בחודש והלאה. החלק שלפני כן משוקף כבר ביתרת הפתיחה", anchorInfo ? ` של ${anchorInfo.dateLabel}` : "", " ואינו נספר שוב."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "3px 0",
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.sub,
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap"
    }
  }, "חיוב אשראי ", r.hasOverride ? "(ידני)" : "(מוערך: קבועות+משתנה)", r.ovrMeta && r.ovrMeta.status === "partial" && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      color: "#8a6400",
      background: COLORS.amberLight,
      borderRadius: 6,
      padding: "1px 6px"
    }
  }, "חלקי"), r.ovrMeta && r.ovrMeta.status === "final" && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      color: COLORS.sage,
      background: COLORS.sageLight,
      borderRadius: 6,
      padding: "1px 6px"
    }
  }, "סופי")), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    key: r.key + "-" + r.creditLump,
    type: "number",
    defaultValue: r.creditLump,
    onBlur: e => {
      const raw = e.target.value.trim();
      // מיקוד ויציאה בלי שינוי לא יוצרים עקיפה ידנית, כדי שהאומדן האוטומטי ימשיך להתעדכן.
      // ניקוי השדה מאפס לאומדן האוטומטי; שינוי ערך בפועל שומר עקיפה ידנית כרגיל.
      if (raw === "") {
        onSetVariableOverride(r.key, null);
        return;
      }
      const v = Number(raw);
      if (!Number.isFinite(v) || v === r.creditLump) return;
      onSetVariableOverride(r.key, v);
    },
    style: {
      width: 80,
      padding: "3px 6px",
      borderRadius: 6,
      border: `1px solid ${COLORS.mist}`,
      fontSize: 12.5,
      textAlign: "center"
    }
  }), r.hasOverride && /*#__PURE__*/React.createElement("button", {
    onClick: () => onSetVariableOverride(r.key, null),
    style: {
      border: "none",
      background: "none",
      color: COLORS.sage,
      fontSize: 11,
      cursor: "pointer",
      textDecoration: "underline"
    }
  }, "איפוס"))), r.cardLines.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      padding: "0 0 4px",
      lineHeight: 1.6
    }
  }, /*#__PURE__*/React.createElement("div", null, "מתוך סך האשראי: גלובלי ", fmt(r.globalCredit), " (", fmt(r.creditFixedTotal), " קבועות + ", fmt(r.autoVariableCredit), " משתנה) · פירוט הכרטיסים למעלה תחת 📎 קבועות")), r.sourceCash > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      padding: "0 0 4px",
      lineHeight: 1.6
    }
  }, "חלק המזומן/ביט של התקציב המשתנה של ", monthLabelOf(r.sourceMonthKey), " (", fmt(r.sourceCash), ") ירד מהבנק באותו חודש, ואינו חלק מסכום האשראי המוערך"), r.hasOverride && cards.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      paddingBottom: 4
    }
  }, "הסכום הידני מחליף את כל סכומי האשראי בחודש זה, כולל כרטיסים"), r.hasOverride && /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.paper,
      borderRadius: 8,
      padding: "6px 8px",
      margin: "2px 0 6px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12,
      color: COLORS.sub,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", null, "סטטוס החיוב:"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onSetVariableOverrideMeta(r.key, {
      status: r.ovrMeta && r.ovrMeta.status === "partial" ? "" : "partial"
    }),
    style: {
      minHeight: 32,
      borderRadius: 8,
      padding: "3px 10px",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      border: `1.5px solid ${r.ovrMeta && r.ovrMeta.status === "partial" ? "#8a6400" : COLORS.mist}`,
      background: r.ovrMeta && r.ovrMeta.status === "partial" ? COLORS.amberLight : "#fff",
      color: r.ovrMeta && r.ovrMeta.status === "partial" ? "#8a6400" : COLORS.sub
    }
  }, "חלקי"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onSetVariableOverrideMeta(r.key, {
      status: r.ovrMeta && r.ovrMeta.status === "final" ? "" : "final"
    }),
    style: {
      minHeight: 32,
      borderRadius: 8,
      padding: "3px 10px",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      border: `1.5px solid ${r.ovrMeta && r.ovrMeta.status === "final" ? COLORS.sage : COLORS.mist}`,
      background: r.ovrMeta && r.ovrMeta.status === "final" ? COLORS.sageLight : "#fff",
      color: r.ovrMeta && r.ovrMeta.status === "final" ? COLORS.sage : COLORS.sub
    }
  }, "סופי")), /*#__PURE__*/React.createElement("input", {
    key: r.key + "-note-" + (r.ovrMeta && r.ovrMeta.note || ""),
    type: "text",
    maxLength: 60,
    defaultValue: r.ovrMeta && r.ovrMeta.note || "",
    placeholder: "הערה קצרה (למשל: לא כולל מקס ועסקאות ממתינות)",
    onBlur: e => {
      const v = e.target.value.trim();
      if (v !== (r.ovrMeta && r.ovrMeta.note || "")) onSetVariableOverrideMeta(r.key, {
        note: v
      });
    },
    style: {
      marginTop: 6,
      width: "100%",
      boxSizing: "border-box",
      padding: "5px 8px",
      borderRadius: 6,
      border: `1px solid ${COLORS.mist}`,
      fontSize: 12
    }
  })), r.unscheduled.map(u => /*#__PURE__*/React.createElement("div", {
    key: u.cardId,
    role: "alert",
    style: {
      fontSize: 12,
      color: "#8a6400",
      background: COLORS.amberLight,
      borderRadius: 8,
      padding: "6px 8px",
      margin: "4px 0",
      lineHeight: 1.5
    }
  }, "⏳ טרם שובץ לתזרים: ", u.name, " — ", fmt(u.total), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.85
    }
  }, "(", u.why || "חסרות הגדרות חיוב", ")"))), r.plannedTotal > 0 && /*#__PURE__*/React.createElement(Row, {
    label: "הוצאות מתוכננות חד-פעמיות",
    value: "-" + fmt(r.plannedTotal)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: `1px solid ${COLORS.mist}`,
      marginTop: 6,
      paddingTop: 6
    }
  }, /*#__PURE__*/React.createElement(Row, {
    label: r.runPartial ? "יתרה מצטברת חלקית" : "יתרה מצטברת עד חודש זה",
    value: fmt(r.running),
    bold: true,
    color: r.running >= 0 ? COLORS.sage : COLORS.coral
  }), r.runPartial && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "#8a6400",
      marginTop: 2
    }
  }, "⚠️ היתרה חלקית: אינה כוללת סכומים שטרם שובצו לתזרים (בחודש זה או בחודשים קודמים)")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      background: COLORS.paper,
      borderRadius: 10,
      padding: "8px 10px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      marginBottom: 6
    }
  }, r.isAnchorMonth && anchorInfo ? `יתרה בתחילת ${anchorInfo.dateLabel}: ${fmt(r.openingForMonth)}` : `יתרת פתיחה לחודש: ${fmt(r.openingForMonth)}`), r.minBal < r.openingForMonth && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: r.minBal < 0 ? COLORS.coral : COLORS.sub,
      marginBottom: 6
    }
  }, "נקודה נמוכה משוערת בחודש: ", fmt(r.minBal), " ביום ", r.minDay), r.cashDirect > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: COLORS.sub,
      marginBottom: 6
    }
  }, "קניות מזומן/ביט (", fmt(r.cashDirect), ") מתפרסות שווה בשווה על ", r.isAnchorMonth ? `ימי החודש מה־${r.fromDay} ואילך` : "ימות החודש", " לצורך ההערכה היומית; התזמון בפועל משתנה."), r.isAnchorMonth && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: COLORS.sub,
      marginBottom: 6
    }
  }, "מוצגות תנועות מה־", r.fromDay, " בחודש והלאה (כולל אותו יום). תנועות מוקדמות יותר משוקפות ביתרה ואינן נספרות שוב."), r.timeline.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: COLORS.sub
    }
  }, "אין עדיין אירועים מתוכננים החודש"), r.timeline.map((ev, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 12,
      padding: "5px 0",
      borderBottom: i === r.timeline.length - 1 ? "none" : `1px solid ${COLORS.mist}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.sub,
      width: 28
    }
  }, ev.day), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontStyle: ev.closing ? "italic" : "normal",
      color: ev.closing ? COLORS.sub : "inherit"
    }
  }, ev.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: ev.amount >= 0 ? COLORS.sage : COLORS.coral,
      marginLeft: 8
    }
  }, ev.amount >= 0 ? "+" : "", fmt(ev.amount)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 90,
      textAlign: "left",
      fontSize: 11,
      color: ev.after < 0 ? COLORS.coral : COLORS.sub,
      fontWeight: ev.after < 0 ? 700 : 400
    }
  }, fmt(ev.after))))), r.plannedForMonth.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      display: "flex",
      flexDirection: "column",
      gap: 4
    }
  }, r.plannedForMonth.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 12,
      color: COLORS.coral,
      background: COLORS.coralLight,
      borderRadius: 8,
      padding: "5px 8px"
    }
  }, /*#__PURE__*/React.createElement("span", null, "📌 ", p.name, " (", p.date.split("-").reverse().join("/"), ")"), /*#__PURE__*/React.createElement("span", null, fmt(p.amount))))), r.entries.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      display: "flex",
      flexDirection: "column",
      gap: 4
    }
  }, r.entries.map(e => /*#__PURE__*/React.createElement("div", {
    key: e.id,
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 12,
      color: COLORS.sub,
      background: COLORS.paper,
      borderRadius: 8,
      padding: "5px 8px"
    }
  }, /*#__PURE__*/React.createElement("span", null, e.source, " (יום ", e.day || 1, ")", e.recurringIncomeId ? /*#__PURE__*/React.createElement("b", {
    style: {
      color: "#8a6400"
    }
  }, " · ", (recurringIncomes || []).some(x => x.id === e.recurringIncomeId) ? "עוקף קבועה" : "הייתה מקושרת לקבועה שנמחקה") : null), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, fmt(e.amount), /*#__PURE__*/React.createElement("button", {
    onClick: () => onRemoveIncome(e.id),
    style: {
      border: "none",
      background: "none",
      color: COLORS.coral,
      cursor: "pointer",
      fontSize: 12
    }
  }, "✕"))))), openMonth === r.key ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    placeholder: "מקור",
    value: srcDraft,
    onChange: e => setSrcDraft(e.target.value),
    style: {
      ...selectStyle,
      flex: 2
    }
  }), /*#__PURE__*/React.createElement("input", {
    type: "number",
    placeholder: "סכום",
    value: amtDraft,
    onChange: e => setAmtDraft(e.target.value),
    style: {
      ...selectStyle,
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("input", {
    type: "number",
    placeholder: "יום",
    min: "1",
    max: "31",
    value: dayDraft,
    onChange: e => setDayDraft(e.target.value),
    style: {
      ...selectStyle,
      flex: 1,
      minWidth: 50
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => addIncomeHere(r.key),
    style: {
      border: "none",
      borderRadius: 8,
      background: COLORS.sage,
      color: "#fff",
      padding: "0 12px",
      fontWeight: 700,
      cursor: "pointer"
    }
  }, "✓")) : /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpenMonth(r.key),
    style: {
      marginTop: 10,
      width: "100%",
      padding: "8px",
      borderRadius: 9,
      border: `1.5px dashed ${COLORS.sage}`,
      background: "none",
      color: COLORS.sage,
      fontSize: 12.5,
      fontWeight: 700,
      cursor: "pointer"
    }
  }, "＋ הוספת הכנסה"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 14,
      padding: "6px 14px",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setSettingsOpen(o => !o),
    "aria-expanded": settingsOpen,
    style: {
      width: "100%",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      border: "none",
      background: "none",
      minHeight: 44,
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
      color: COLORS.ink,
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("span", null, "⚙️ הגדרות תחזית"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.sub,
      fontSize: 12
    }
  }, settingsOpen ? "סגירה ▴" : "פתיחה ▾")), settingsOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "מועד חיוב האשראי"), /*#__PURE__*/React.createElement("button", {
    onClick: onToggleCreditLag,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      border: "none",
      background: creditLag ? COLORS.sageLight : COLORS.card,
      color: creditLag ? COLORS.sage : COLORS.sub,
      padding: "6px 10px",
      borderRadius: 9,
      fontSize: 11.5,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "💳 חיוב אשראי בחודש הבא ", creditLag ? "✓" : "")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.paper,
      borderRadius: 12,
      padding: "10px 12px",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "יתרת פתיחה בבנק"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "flex-end",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: "0 1 140px"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    defaultValue: openingBalance,
    onBlur: e => onSetOpeningBalance(Number(e.target.value) || 0),
    style: {
      ...inputStyle,
      textAlign: "center",
      fontWeight: 700
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: "0 1 175px"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "נכון לתאריך"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: openingBalanceDate || "",
    onChange: e => onSetOpeningBalanceDate(e.target.value),
    style: {
      ...inputStyle
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      marginTop: 6,
      lineHeight: 1.5
    }
  }, openingBalanceDate ? "היתרה מתייחסת לתחילת היום שנבחר, לפני התנועות של אותו יום. התחזית סופרת רק תנועות מהתאריך והלאה (כולל אותו יום), ותנועות קודמות לא נספרות פעמיים. אם היתרה בבנק כבר כוללת את תנועות היום, בחרו את התאריך של מחר." : "ללא תאריך, היתרה נחשבת יתרת פתיחה של חודש התחזית הראשון (החודש הבא).")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.paper,
      borderRadius: 12,
      padding: "10px 12px",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "יום חיוב אשראי בחודש"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    max: "31",
    defaultValue: creditBillingDay,
    onBlur: e => {
      const v = Number(e.target.value);
      if (!Number.isInteger(v) || v < 1 || v > 31) {
        e.target.value = String(creditBillingDay);
        e.target.setCustomValidity("יום החיוב חייב להיות מספר שלם בין 1 ל־31");
        e.target.reportValidity();
        return;
      }
      e.target.setCustomValidity("");
      onSetCreditBillingDay(v);
    },
    style: {
      ...inputStyle,
      maxWidth: 100,
      textAlign: "center",
      fontWeight: 700
    }
  })), /*#__PURE__*/React.createElement(RecurringIncomesPanel, {
    recurringIncomes: recurringIncomes,
    incomeEntries: incomeEntries,
    onSave: onSaveRecurring,
    onLink: onLinkEntries
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: `1px solid ${COLORS.mist}`,
      marginTop: 12,
      paddingTop: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setCardsOpen(o => !o),
    "aria-expanded": cardsOpen,
    style: {
      width: "100%",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      border: "none",
      background: "none",
      minHeight: 44,
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
      color: COLORS.ink,
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("span", null, "💳 ניהול כרטיסי אשראי (", cards.length, ")"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.sub,
      fontSize: 12
    }
  }, cardsOpen ? "סגירה ▴" : "פתיחה ▾")), cardsOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      lineHeight: 1.5,
      marginBottom: 8
    }
  }, "כרטיס נכנס לתחזית רק אחרי שהוגדרו לו יום חיוב וחודש חיוב. אין ערכי ברירת מחדל, והמועד בתחזית הוא הערכה לפי ההגדרות שהזנת ולא מועד בנקאי מאומת. הוצאות ללא כרטיס ממשיכות לפי ההגדרה הגלובלית."), cards.map(c => {
    const used = fixedExpenses.filter(f => f.cardId === c.id).length;
    const miss = cardMissingSettings(c);
    const upd = patch => onSaveCards(cards.map(x => x.id === c.id ? {
      ...x,
      ...patch
    } : x));
    const sel = {
      height: 40,
      borderRadius: 10,
      border: `1px solid ${COLORS.mist}`,
      background: "#fff",
      fontSize: 15,
      fontFamily: "inherit",
      minWidth: 0,
      padding: "0 6px"
    };
    return /*#__PURE__*/React.createElement("div", {
      key: c.id,
      style: {
        borderTop: `1px solid ${COLORS.mist}`,
        padding: "10px 0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("input", {
      "aria-label": "שם הכרטיס",
      defaultValue: c.name,
      placeholder: "שם הכרטיס",
      onBlur: e => {
        const v = e.target.value.trim();
        if (v && v !== c.name) upd({
          name: v
        });
      },
      style: {
        ...sel,
        flex: 1,
        fontWeight: 700,
        fontSize: 16
      }
    }), used === 0 ? /*#__PURE__*/React.createElement("button", {
      "aria-label": "מחיקת כרטיס",
      onClick: () => onSaveCards(cards.filter(x => x.id !== c.id)),
      style: {
        width: 44,
        height: 40,
        borderRadius: 10,
        border: "none",
        background: COLORS.paper,
        color: COLORS.coral,
        cursor: "pointer",
        fontSize: 16
      }
    }, "🗑") : /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: COLORS.sub,
        whiteSpace: "nowrap"
      }
    }, "בשימוש ב־", used)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        marginTop: 8
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: labelStyle
    }, "יום חיוב"), /*#__PURE__*/React.createElement("select", {
      "aria-label": "יום חיוב",
      value: Number.isInteger(c.billingDay) ? String(c.billingDay) : "",
      onChange: e => upd({
        billingDay: e.target.value === "" ? null : Number(e.target.value)
      }),
      style: {
        ...sel,
        width: "100%"
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "לא הוגדר"), Array.from({
      length: 31
    }, (_, i) => /*#__PURE__*/React.createElement("option", {
      key: i + 1,
      value: i + 1
    }, i + 1)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: labelStyle
    }, "חודש החיוב"), /*#__PURE__*/React.createElement("select", {
      "aria-label": "חודש החיוב",
      value: Number.isInteger(c.lag) ? String(c.lag) : "",
      onChange: e => upd({
        lag: e.target.value === "" ? null : Number(e.target.value)
      }),
      style: {
        ...sel,
        width: "100%"
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "לא הוגדר"), /*#__PURE__*/React.createElement("option", {
      value: "0"
    }, "באותו חודש ההוצאה"), /*#__PURE__*/React.createElement("option", {
      value: "1"
    }, "חודש אחרי"), /*#__PURE__*/React.createElement("option", {
      value: "2"
    }, "חודשיים אחרי"), /*#__PURE__*/React.createElement("option", {
      value: "3"
    }, "3 חודשים אחרי")))), miss && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "#8a6400",
        background: COLORS.amberLight,
        borderRadius: 8,
        padding: "5px 8px",
        marginTop: 6
      }
    }, "⚠️ ", miss, " — הכרטיס לא ישובץ בתזרים"));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      borderTop: cards.length ? `1px solid ${COLORS.mist}` : "none",
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement("input", {
    "aria-label": "שם כרטיס חדש",
    value: newCardName,
    onChange: e => setNewCardName(e.target.value),
    placeholder: "שם כרטיס חדש (למשל: ויזה 5808)",
    style: {
      flex: 1,
      minWidth: 0,
      height: 40,
      borderRadius: 10,
      border: `1px solid ${COLORS.mist}`,
      fontSize: 16,
      padding: "0 10px",
      fontFamily: "inherit"
    }
  }), /*#__PURE__*/React.createElement("button", {
    disabled: !newCardName.trim(),
    onClick: () => {
      onSaveCards([...cards, {
        id: uid(),
        name: newCardName.trim(),
        billingDay: null,
        lag: null
      }]);
      setNewCardName("");
    },
    style: {
      minHeight: 40,
      padding: "0 14px",
      borderRadius: 10,
      border: "none",
      background: COLORS.sage,
      color: "#fff",
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      opacity: newCardName.trim() ? 1 : 0.5
    }
  }, "הוספה")))))));
}

/* ================= ADVICE TAB ================= */
// ניתוחים בטעינה כרגע (לפי תקופה) - מונע לחיצה כפולה גם אחרי מעבר בין לשוניות
const ADVICE_INFLIGHT = {};
function periodLabel(p) {
  const m = /^(\d{4})-(\d{2})$/.exec(p || "");
  return m ? `${HEBREW_MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
}
function fmtDateTime(ts) {
  try {
    return new Date(ts).toLocaleString("he-IL", {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch (e) {
    return "";
  }
}
function adviceFingerprint(payload) {
  const str = JSON.stringify(payload);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33 ^ str.charCodeAt(i)) >>> 0;
  return String(h);
}
function AdviceTab({
  monthDate,
  perCategory,
  totalBudget,
  totalSpent,
  fixedExpenses,
  advices,
  legacyAdvice,
  onSaved
}) {
  const period = monthKey(monthDate);
  const label = periodLabel(period);
  const [req, setReq] = useState(null); // { period, status: "loading" | "error", error }
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // הנתונים שנשלחים לניתוח: נבנים מהנתונים שמוצגים במסך עבור החודש הנבחר בלבד
  const payload = useMemo(() => ({
    period,
    categories: perCategory.map(c => ({
      name: c.name,
      budget: c.budget,
      spent: c.spent
    })),
    totalBudget,
    totalSpent,
    fixed: fixedExpenses.map(f => ({
      name: f.name,
      amount: Number(f.amount) || 0,
      onCredit: !!f.onCredit,
      frequencyMonths: f.frequencyMonths || 1
    }))
  }), [period, perCategory, totalBudget, totalSpent, fixedExpenses]);
  const fingerprint = useMemo(() => adviceFingerprint(payload), [payload]);
  const forPeriod = advices.filter(a => a.period === period).sort((x, y) => y.generatedAt - x.generatedAt);
  const current = forPeriod[0] || null;
  const history = [...advices.filter(a => a !== current), ...(legacyAdvice && legacyAdvice.advice ? [{
    legacy: true,
    advice: legacyAdvice.advice,
    generatedAt: legacyAdvice.generatedAt,
    period: null
  }] : [])].sort((x, y) => (y.generatedAt || 0) - (x.generatedAt || 0));
  const loading = !!ADVICE_INFLIGHT[period] || req && req.period === period && req.status === "loading";
  const error = req && req.period === period && req.status === "error" ? req.error : "";
  const getAdvice = async () => {
    if (ADVICE_INFLIGHT[period]) return;
    const reqPeriod = period,
      reqPayload = payload,
      reqFp = fingerprint;
    const now = new Date(),
      cur = monthKey(now);
    const dim = daysInMonth(monthDate);
    const daysPassed = reqPeriod < cur ? dim : reqPeriod === cur ? now.getDate() : 0;
    ADVICE_INFLIGHT[reqPeriod] = true;
    setReq({
      period: reqPeriod,
      status: "loading"
    });
    try {
      const res = await fetch("/api/financial-advice", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "fb"
        },
        body: JSON.stringify({
          ...reqPayload,
          daysPassed,
          daysInMonth: dim
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "שגיאה");
      if (json.period !== reqPeriod) throw new Error("השרת מחזיר ניתוח ללא תקופה מתאימה. יש להעלות את גרסת financial-advice.js העדכנית.");
      if (!json.advice) throw new Error("לא התקבלה תשובה מהמודל");
      // נשמר תמיד תחת התקופה שנשלחה, גם אם בינתיים עברו לחודש אחר
      await onSaved({
        id: String(json.generatedAt || Date.now()),
        period: reqPeriod,
        generatedAt: json.generatedAt || Date.now(),
        advice: json.advice,
        fingerprint: reqFp
      });
      if (mounted.current) setReq(r => r && r.period === reqPeriod ? null : r);
    } catch (e) {
      if (mounted.current) setReq({
        period: reqPeriod,
        status: "error",
        error: e.message
      });
    } finally {
      delete ADVICE_INFLIGHT[reqPeriod];
    }
  };
  const btn = (text, primary) => /*#__PURE__*/React.createElement("button", {
    onClick: getAdvice,
    disabled: loading,
    style: {
      border: "none",
      background: primary ? COLORS.sage : COLORS.sageLight,
      color: primary ? "#fff" : COLORS.sage,
      padding: primary ? "12px 22px" : "9px 16px",
      borderRadius: primary ? 12 : 10,
      fontSize: primary ? 14 : 12.5,
      fontWeight: 700,
      cursor: loading ? "default" : "pointer",
      opacity: loading ? 0.6 : 1,
      minHeight: 40
    }
  }, loading ? "מנתח…" : text);
  const stale = current && current.fingerprint && current.fingerprint !== fingerprint;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 15,
      margin: "6px 2px 4px"
    }
  }, "חוות דעת AI · ", label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: COLORS.sub,
      marginBottom: 14
    }
  }, "ניתוח קצר של ההתנהלות הכלכלית בחודש הנבחר, מבוסס על הנתונים שלו. ניתוח נוצר רק בלחיצה על הכפתור."), error && /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.coralLight,
      color: COLORS.coral,
      borderRadius: 12,
      padding: "10px 14px",
      fontSize: 12.5,
      marginBottom: 12,
      overflowWrap: "anywhere"
    }
  }, "שגיאה ברענון הניתוח: ", error), !current ? /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      padding: 22,
      textAlign: "center",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 30,
      marginBottom: 10
    }
  }, "💬"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 14,
      marginBottom: 6
    }
  }, "אין ניתוח לחודש ", label), /*#__PURE__*/React.createElement("div", {
    style: {
      color: COLORS.sub,
      fontSize: 12.5,
      marginBottom: 16
    }
  }, "לחץ כדי לקבל חוות דעת על התקציב וההוצאות של ", label), btn("קבל ניתוח", true)) : /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      padding: 18,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px 10px",
      fontSize: 11.5,
      color: COLORS.sub,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      color: COLORS.sage
    }
  }, "תקופת הניתוח: ", label), /*#__PURE__*/React.createElement("span", null, "הופק: ", fmtDateTime(current.generatedAt))), stale && /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.amberLight,
      borderRadius: 10,
      padding: "8px 12px",
      fontSize: 12,
      marginBottom: 10
    }
  }, "⚠️ הנתונים השתנו מאז הניתוח"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      lineHeight: 1.8,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere"
    }
  }, current.advice), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: "flex",
      justifyContent: "flex-end"
    }
  }, btn("רענן ניתוח", false))), history.length > 0 && /*#__PURE__*/React.createElement("details", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("summary", {
    style: {
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
      padding: "8px 2px",
      color: COLORS.sub
    }
  }, "ניתוחים קודמים (", history.length, ")"), history.map((h, i) => /*#__PURE__*/React.createElement("div", {
    key: (h.id || "legacy") + i,
    style: {
      background: COLORS.card,
      borderRadius: 14,
      padding: 14,
      marginTop: 8,
      opacity: 0.95
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px 10px",
      fontSize: 11.5,
      color: COLORS.sub,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      color: h.period ? COLORS.ink : COLORS.amber
    }
  }, h.period ? `תקופת הניתוח: ${periodLabel(h.period)}` : "תקופת הניתוח אינה ידועה"), h.generatedAt ? /*#__PURE__*/React.createElement("span", null, "הופק: ", fmtDateTime(h.generatedAt)) : null, /*#__PURE__*/React.createElement("span", null, "· היסטורי, לא ייעוץ לחודש הפעיל", h.period === period ? " (גרסה קודמת)" : "")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      lineHeight: 1.7,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere"
    }
  }, h.advice)))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 70
    }
  }));
}
function BudgetTab({
  categories,
  monthBudgets,
  budgetInfo,
  onSetBudget,
  onAddCategory,
  onUpdateCategory,
  onRemoveCategory,
  onCopyPrev,
  cashInfo,
  onSetCashBudget,
  effectiveTotalBudget
}) {
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
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 700,
      fontSize: 15
    }
  }, "ניהול תקציב חודשי"), /*#__PURE__*/React.createElement("button", {
    onClick: onCopyPrev,
    style: {
      fontSize: 12,
      border: "none",
      background: COLORS.sageLight,
      color: COLORS.sage,
      padding: "6px 10px",
      borderRadius: 9,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "⧉ העתק מחודש קודם")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 14
    }
  }, active.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "11px 14px",
      borderBottom: i === active.length - 1 ? "none" : `1px solid ${COLORS.mist}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18
    }
  }, c.icon), editingId === c.id ? /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    defaultValue: c.name,
    onBlur: e => {
      onUpdateCategory(c.id, {
        name: e.target.value || c.name
      });
      setEditingId(null);
    },
    onKeyDown: e => {
      if (e.key === "Enter") e.target.blur();
    },
    style: {
      flex: 1,
      padding: "5px 8px",
      borderRadius: 7,
      border: `1px solid ${COLORS.mist}`,
      fontSize: 13
    }
  }) : /*#__PURE__*/React.createElement("span", {
    onClick: () => setEditingId(c.id),
    style: {
      flex: 1,
      fontSize: 13.5,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, c.name), /*#__PURE__*/React.createElement("input", {
    key: c.id + "-" + (explicit ? "exp" : "inh"),
    type: "number",
    placeholder: explicit ? "0" : String(Number(effectiveMap[c.id]) || 0),
    defaultValue: explicit ? monthBudgets[c.id] || "" : "",
    onBlur: e => {
      const raw = e.target.value.trim();
      // מיקוד ויציאה בלי הקלדה לא שומרים: בחודש יורש נשמרת הירושה, ובחודש מפורש נשמר הערך הקיים.
      // הקלדת ערך (כולל 0 מפורש) נשמרת כרגיל; ניקוי ערך קיים בחודש מפורש שומר 0 כמו קודם.
      if (raw === "") {
        if (explicit && monthBudgets[c.id] !== undefined) onSetBudget(c.id, 0);
        return;
      }
      const v = Number(raw);
      if (!Number.isFinite(v)) return;
      if (explicit && monthBudgets[c.id] !== undefined && v === Number(monthBudgets[c.id])) return;
      onSetBudget(c.id, v);
    },
    style: {
      width: 82,
      padding: "7px 8px",
      borderRadius: 8,
      border: `1px solid ${COLORS.mist}`,
      fontSize: 13,
      textAlign: "center"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub
    }
  }, "₪"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onRemoveCategory(c.id),
    style: {
      ...iconBtnStyle,
      color: COLORS.coral
    }
  }, "🗑")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      padding: "0 4px 14px",
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: COLORS.sub
    }
  }, "סה\"כ תקציב חודשי"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800,
      fontFamily: "Heebo, sans-serif"
    }
  }, fmt(totalBudget))), sourceLabel && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      padding: "0 4px 14px",
      marginTop: -8,
      lineHeight: 1.5
    }
  }, "החלוקה נמשכת אוטומטית מ", sourceLabel, ". שינוי ערך מעתיק את כל החלוקה לחודש זה ומחיל את השינוי עליו בלבד."), /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      padding: "12px 14px",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "חלוקת התקציב לפי אמצעי תשלום"), sourceLabel && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      marginBottom: 8,
      lineHeight: 1.5
    }
  }, "החלוקה מחושבת מול התקציב שנמשך מ", sourceLabel, ": ", /*#__PURE__*/React.createElement("b", null, fmt(cashCapTotal)), "."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, "מזומן / ביט מהבנק (יורד באותו חודש):"), /*#__PURE__*/React.createElement("input", {
    key: "cash-" + (cashExplicit !== null ? cashExplicit : "inh" + cashEffective),
    type: "number",
    inputMode: "decimal",
    min: "0",
    placeholder: cashExplicit === null && cashEffective > 0 ? String(cashEffective) : "0",
    defaultValue: cashExplicit !== null ? cashExplicit : "",
    onBlur: e => {
      const raw = e.target.value.trim();
      if (raw === "") {
        onSetCashBudget(null);
        return;
      }
      let v = Number(raw);
      if (!Number.isFinite(v) || v < 0) v = 0;
      if (v > cashCapTotal) v = cashCapTotal;
      e.target.value = String(v);
      onSetCashBudget(v);
    },
    style: {
      width: 90,
      padding: "7px 8px",
      borderRadius: 8,
      border: `1px solid ${COLORS.mist}`,
      fontSize: 13,
      textAlign: "center"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub
    }
  }, "₪")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: COLORS.sub,
      marginTop: 8,
      lineHeight: 1.6
    }
  }, Math.min(cashEffective, cashCapTotal) > 0 ? /*#__PURE__*/React.createElement("span", null, "אשראי (יורד בחיוב האשראי): ", /*#__PURE__*/React.createElement("b", null, fmt(cashCapTotal - Math.min(cashEffective, cashCapTotal))), " · מזומן/ביט: ", /*#__PURE__*/React.createElement("b", null, fmt(Math.min(cashEffective, cashCapTotal)))) : "כרגע כל התקציב מחושב כאשראי (יורד בחיוב האשראי).", cashExplicit === null && cashInfo && cashInfo.sourceKey && cashEffective > 0 && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("br", null), "החלוקה נמשכת אוטומטית מ", monthLabelOf(cashInfo.sourceKey), ". שינוי או איפוס כאן יחולו על החודש המוצג בלבד."), /*#__PURE__*/React.createElement("br", null), "ביט בטעינת אשראי יורד בחיוב האשראי, ולכן נספר בחלק האשראי. הסכום לא יכול לעבור את סך התקציב החודשי.", /*#__PURE__*/React.createElement("br", null), "חודש ללא חלוקה מוגדרת יורש את החלוקה האחרונה שהוגדרה לפניו. אפשר לשנות לחודש מסוים בלבד, והזנת 0 מחשבת אותו כאשראי במלואו.")), !adding ? /*#__PURE__*/React.createElement("button", {
    onClick: () => setAdding(true),
    style: {
      width: "100%",
      padding: "12px",
      borderRadius: 12,
      border: `1.5px dashed ${COLORS.sage}`,
      background: "none",
      color: COLORS.sage,
      fontWeight: 700,
      fontSize: 13.5,
      cursor: "pointer"
    }
  }, "＋ הוספת קטגוריה") : /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.card,
      borderRadius: 16,
      padding: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 10
    }
  }, ICON_OPTIONS.map(ic => /*#__PURE__*/React.createElement("button", {
    key: ic,
    onClick: () => setNewIcon(ic),
    style: {
      fontSize: 17,
      width: 34,
      height: 34,
      borderRadius: 9,
      border: `2px solid ${newIcon === ic ? COLORS.sage : COLORS.mist}`,
      background: newIcon === ic ? COLORS.sageLight : "#fff",
      cursor: "pointer"
    }
  }, ic))), /*#__PURE__*/React.createElement("input", {
    placeholder: "שם הקטגוריה",
    value: newName,
    onChange: e => setNewName(e.target.value),
    style: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 10,
      border: `1px solid ${COLORS.mist}`,
      fontSize: 13.5,
      marginBottom: 10,
      boxSizing: "border-box"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setAdding(false);
      setNewName("");
    },
    style: {
      flex: 1,
      padding: "10px",
      borderRadius: 10,
      border: `1px solid ${COLORS.mist}`,
      background: "#fff",
      cursor: "pointer",
      fontSize: 13
    }
  }, "ביטול"), /*#__PURE__*/React.createElement("button", {
    disabled: !newName.trim(),
    onClick: () => {
      onAddCategory(newName.trim(), newIcon);
      setNewName("");
      setAdding(false);
    },
    style: {
      flex: 1,
      padding: "10px",
      borderRadius: 10,
      border: "none",
      background: COLORS.sage,
      color: "#fff",
      fontWeight: 700,
      cursor: "pointer",
      fontSize: 13
    }
  }, "שמירה"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 20
    }
  }));
}

/* ================= EXPENSE MODAL ================= */
function ExpenseModal({
  categories,
  user,
  initial,
  onClose,
  onSave,
  onDelete
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? "");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [who, setWho] = useState(initial?.user ?? user);
  const canSave = Number(amount) > 0 && categoryId && /^\d{4}-\d{2}-\d{2}$/.test(date || "");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(20,33,61,0.4)",
      zIndex: 60,
      display: "flex",
      alignItems: "flex-end"
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "#fff",
      width: "100%",
      borderRadius: "20px 20px 0 0",
      padding: "18px 18px 26px",
      maxHeight: "88vh",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "Heebo, sans-serif",
      fontWeight: 800,
      fontSize: 18
    }
  }, initial ? "עריכת הוצאה" : "הוצאה חדשה"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "סגירת עריכת הוצאה",
    style: {
      ...iconBtnStyle,
      width: 44,
      height: 44
    }
  }, "✕")), /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "סכום"), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    type: "number",
    inputMode: "decimal",
    placeholder: "0",
    value: amount,
    onChange: e => setAmount(e.target.value),
    style: {
      width: "100%",
      padding: "14px",
      borderRadius: 12,
      border: `1.5px solid ${COLORS.mist}`,
      fontSize: 22,
      fontWeight: 700,
      textAlign: "center",
      marginBottom: 14,
      boxSizing: "border-box"
    }
  }), /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "קטגוריה"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 7,
      marginBottom: 14
    }
  }, categories.map(c => /*#__PURE__*/React.createElement("button", {
    key: c.id,
    onClick: () => setCategoryId(c.id),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      padding: "8px 12px",
      borderRadius: 999,
      border: `1.5px solid ${categoryId === c.id ? COLORS.sage : COLORS.mist}`,
      background: categoryId === c.id ? COLORS.sageLight : "#fff",
      fontSize: 12.5,
      cursor: "pointer",
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", null, c.icon), c.name))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "תאריך"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: date,
    onChange: e => setDate(e.target.value),
    style: inputStyle
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "מי ביצע"), /*#__PURE__*/React.createElement("input", {
    value: who,
    onChange: e => setWho(e.target.value),
    style: inputStyle
  }))), /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, "תיאור / הערה"), /*#__PURE__*/React.createElement("input", {
    placeholder: "למשל: קניות שבועיות",
    value: description,
    onChange: e => setDescription(e.target.value),
    style: {
      ...inputStyle,
      marginBottom: 20
    }
  }), /*#__PURE__*/React.createElement("button", {
    disabled: !canSave,
    onClick: () => onSave({
      id: initial?.id,
      amount: Number(amount),
      categoryId,
      date,
      description,
      user: who
    }),
    style: {
      width: "100%",
      padding: "14px",
      borderRadius: 12,
      border: "none",
      background: canSave ? COLORS.sage : COLORS.mist,
      color: "#fff",
      fontWeight: 800,
      fontSize: 15,
      cursor: canSave ? "pointer" : "default"
    }
  }, "שמירה"), initial && onDelete && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, !confirmDelete ? /*#__PURE__*/React.createElement("button", {
    onClick: () => setConfirmDelete(true),
    style: {
      width: "100%",
      minHeight: 44,
      border: "none",
      borderRadius: 10,
      background: COLORS.paper,
      color: COLORS.coral,
      fontFamily: "inherit",
      fontSize: 14
    }
  }, "מחיקת ההוצאה") : /*#__PURE__*/React.createElement("div", {
    style: {
      background: COLORS.paper,
      borderRadius: 12,
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      marginBottom: 10
    }
  }, "למחוק את \"", initial.description || categoryOf(categories, initial.categoryId).name, "\" (", fmt(initial.amount), ")?"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setConfirmDelete(false),
    style: {
      flex: 1,
      minHeight: 44,
      borderRadius: 10,
      border: `1px solid ${COLORS.mist}`,
      background: "white",
      fontFamily: "inherit"
    }
  }, "ביטול"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onDelete(initial.id),
    style: {
      flex: 1,
      minHeight: 44,
      borderRadius: 10,
      border: "none",
      color: "white",
      background: COLORS.coral,
      fontFamily: "inherit"
    }
  }, "אישור מחיקה"))))));
}
const labelStyle = {
  fontSize: 12,
  color: COLORS.sub,
  fontWeight: 600,
  marginBottom: 6,
  display: "block"
};
const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: `1.5px solid ${COLORS.mist}`,
  fontSize: 13.5,
  boxSizing: "border-box"
};
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(BudgetApp, null));
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
