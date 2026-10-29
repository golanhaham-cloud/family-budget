// Netlify Function: ייעוץ פיננסי. מקבל POST עם נתוני החודש הנבחר (period = YYYY-MM) ומחזיר ניתוח + התקופה שעליה הוא מבוסס.
const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const num = (v) => Number(v) || 0;
const json = (statusCode, obj) => ({ statusCode, headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(obj) });

exports.handler = async function (event) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return json(500, { error: "GEMINI_API_KEY לא מוגדר בהגדרות הסביבה של נטליפיי" });
  if (event.httpMethod !== "POST") return json(405, { error: "יש לשלוח את נתוני החודש בבקשת POST" });

  try {
    const p = JSON.parse(event.body || "{}");
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(p.period || "");
    if (!m) return json(400, { error: "תקופה לא תקינה" });
    const label = `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
    const dim = num(p.daysInMonth) || 30;
    const passed = Math.max(0, Math.min(dim, num(p.daysPassed)));
    const timeLine = passed >= dim ? `החודש ${label} הסתיים (כל ${dim} הימים עברו)`
      : passed === 0 ? `החודש ${label} טרם החל`
      : `${passed} מתוך ${dim} ימים עברו מחודש ${label}`;

    const catLines = (p.categories || []).map((c) => `- ${c.name}: תקציב ${num(c.budget)} ₪, הוצאה בפועל ${num(c.spent)} ₪`);
    const fixedLines = (p.fixed || []).map((f) => `- ${f.name}: ${num(f.amount)} ₪ (${f.onCredit ? "אשראי" : "חיוב ישיר"}, ${num(f.frequencyMonths) > 1 ? "דו-חודשי" : "חודשי"})`);

    const prompt = `אתה יועץ פיננסי משפחתי חם וישיר. הנה נתוני התקציב המשתנה של משפחה לחודש ${label} (${timeLine}):

קטגוריות (תקציב מול הוצאה בפועל):
${catLines.join("\n") || "אין נתוני קטגוריות"}

סה"כ תקציב משתנה: ${num(p.totalBudget)} ₪, סה"כ הוצאה בפועל: ${num(p.totalSpent)} ₪

הוצאות קבועות:
${fixedLines.join("\n") || "אין הוצאות קבועות מוגדרות"}

כתוב חוות דעת קצרה בעברית (עד כ-180 מילים) על חודש ${label} בלבד: התייחס לקצב ההוצאה מול הזמן שעבר, ציין קטגוריה אחת או שתיים שבולטות לטובה או לרעה, ותן המלצה מעשית אחת וברורה. טון חם, ישיר, לא רובוטי ולא מטיף.`;

    const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!geminiRes.ok) throw new Error("שגיאה מול Gemini: " + (await geminiRes.text()).slice(0, 200));
    const g = await geminiRes.json();
    const advice = g.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!advice) throw new Error("לא התקבלה תשובה מהמודל. נסה שוב בעוד רגע.");
    return json(200, { advice, generatedAt: Date.now(), period: p.period });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
