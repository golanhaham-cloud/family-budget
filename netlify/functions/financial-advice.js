const JSONBIN_KEY = "$2a$10$kkHgiizSJvcrwVITcEUyR.54ETgOge.LQOe2krljF5w.usnpmzgsC";
const JSONBIN_ID = "6a84c53fda38895dfef45d8e";

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

exports.handler = async function () {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY לא מוגדר בהגדרות הסביבה של נטליפיי" }) };
  }

  try {
    const getRes = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_KEY },
    });
    if (!getRes.ok) throw new Error("שליפת הנתונים נכשלה");
    const getJson = await getRes.json();
    const record = getJson.record;

    const mKey = monthKey(new Date());
    const budgets = (record.budgets && record.budgets[mKey]) || {};
    const categories = (record.categories || []).filter((c) => c.active !== false);
    const expenses = (record.expenses || []).filter((e) => e.date && e.date.startsWith(mKey));

    const perCategoryLines = categories.map((c) => {
      const budget = Number(budgets[c.id]) || 0;
      const spent = expenses.filter((e) => e.categoryId === c.id).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return `- ${c.name}: תקציב ${budget} ₪, הוצאה בפועל ${spent} ₪`;
    });

    const fixedLines = (record.fixedExpenses || [])
      .filter((f) => f.active !== false)
      .map((f) => `- ${f.name}: ${f.amount} ₪ (${f.onCredit ? "אשראי" : "חיוב ישיר"}, ${(f.frequencyMonths || 1) > 1 ? "דו-חודשי" : "חודשי"})`);

    const totalBudget = categories.reduce((s, c) => s + (Number(budgets[c.id]) || 0), 0);
    const totalSpent = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = now.getDate();

    const prompt = `אתה יועץ פיננסי משפחתי חם וישיר. הנה נתוני התקציב המשתנה החודשי של משפחה (${daysPassed} מתוך ${daysInMonth} ימים עברו החודש):

קטגוריות (תקציב מול הוצאה בפועל):
${perCategoryLines.join("\n") || "אין נתוני קטגוריות"}

סה"כ תקציב משתנה: ${totalBudget} ₪, סה"כ הוצאה בפועל: ${totalSpent} ₪

הוצאות קבועות חודשיות:
${fixedLines.join("\n") || "אין הוצאות קבועות מוגדרות"}

כתוב חוות דעת קצרה בעברית (עד כ-180 מילים): התייחס לקצב ההוצאה מול הזמן שעבר בחודש, ציין קטגוריה אחת או שתיים שבולטות לטובה או לרעה, ותן המלצה מעשית אחת וברורה. טון חם, ישיר, לא רובוטי ולא מטיף.`;

    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error("שגיאה מול Gemini: " + errText.slice(0, 200));
    }
    const geminiJson = await geminiRes.json();
    const advice =
      geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || "לא התקבלה תשובה מהמודל. נסה שוב בעוד רגע.";

    return { statusCode: 200, body: JSON.stringify({ advice, generatedAt: Date.now() }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
