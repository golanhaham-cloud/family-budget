const JSONBIN_KEY = "$2a$10$kkHgiizSJvcrwVITcEUyR.54ETgOge.LQOe2krljF5w.usnpmzgsC";
const JSONBIN_ID = "6a84c53fda38895dfef45d8e";

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmt(n) {
  return Math.round(Number(n) || 0).toLocaleString("he-IL") + " ₪";
}

exports.handler = async function () {
  try {
    const getRes = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_KEY },
    });
    if (!getRes.ok) throw new Error("שליפת הנתונים נכשלה");
    const getJson = await getRes.json();
    const record = getJson.record;

    const mKey = monthKey(new Date());
    const budgets = (record.budgets && record.budgets[mKey]) || {};
    const totalBudget = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0);

    const expenses = (record.expenses || []).filter((e) => e.date && e.date.startsWith(mKey));
    const totalSpent = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const remaining = totalBudget - totalSpent;
    const percent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    let alert = false;
    let message = "";
    if (percent >= 100) {
      alert = true;
      message = `⚠️ חרגתם מהתקציב ב-${fmt(totalSpent - totalBudget)}`;
    } else if (percent >= 80) {
      alert = true;
      message = `⚠️ נוצלו ${percent}% מהתקציב החודשי, נשארו ${fmt(remaining)}`;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ percent, totalBudget, totalSpent, remaining, alert, message }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
