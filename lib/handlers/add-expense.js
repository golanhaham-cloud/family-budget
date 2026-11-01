// Adds one expense. Requires a session cookie OR the automation Bearer token (API_TOKEN env var).
const A = require("../auth");
const { readState, writeState } = require("../state");
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return A.json(405, { error: "יש להשתמש ב-POST" });
  const denied = A.authorize(event, { allowApiToken: true });
  if (denied) return denied;
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return A.json(400, { error: "bad json" }); }
  const { amount, categoryId, description, user } = body;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : new Date().toISOString().slice(0, 10);
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0 || !categoryId || !user)
    return A.json(400, { error: "חסרים שדות חובה תקינים: amount, categoryId, user" });
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = await readState(event);
    if (!s.data) return A.json(409, { error: "no data" });
    const expense = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      categoryId: String(categoryId).slice(0, 80), amount: amt, date,
      description: String(description || "").slice(0, 300), user: String(user).slice(0, 80), createdAt: Date.now(),
    };
    const r = await writeState(event, { ...s.data, expenses: [...(s.data.expenses || []), expense] }, s.version);
    if (r.ok) return A.json(200, { ok: true, expense });
    if (r.status !== 409) return A.json(r.status, { error: r.error });
  }
  return A.json(409, { error: "conflict, try again" });
};
