const A = require("../auth");
const { readState } = require("../state");
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("he-IL") + " ₪";
exports.handler = async function (event) {
  const denied = A.authorize(event, { allowApiToken: true });
  if (denied) return denied;
  const { data: record } = await readState(event);
  if (!record) return A.json(404, { error: "no data" });
  const mKey = monthKey(new Date());
  const budgets = (record.budgets && record.budgets[mKey]) || {};
  const totalBudget = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0);
  const totalSpent = (record.expenses || []).filter((e) => e.date && e.date.startsWith(mKey)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const remaining = totalBudget - totalSpent;
  const percent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  let alert = false, message = "";
  if (percent >= 100) { alert = true; message = `⚠️ חרגתם מהתקציב ב-${fmt(totalSpent - totalBudget)}`; }
  else if (percent >= 80) { alert = true; message = `⚠️ נוצלו ${percent}% מהתקציב החודשי, נשארו ${fmt(remaining)}`; }
  return A.json(200, { percent, totalBudget, totalSpent, remaining, alert, message });
};
