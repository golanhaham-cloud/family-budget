const JSONBIN_KEY = "$2a$10$kkHgiizSJvcrwVITcEUyR.54ETgOge.LQOe2krljF5w.usnpmzgsC";
const JSONBIN_ID = "6a84c53fda38895dfef45d8e";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "יש להשתמש ב-POST" }) };
  }

  let body;
  const raw = event.body || "";
  try {
    body = JSON.parse(raw);
  } catch (e) {
    const params = new URLSearchParams(raw);
    body = Object.fromEntries(params.entries());
  }

  const { amount, categoryId, description, user } = body;
  const date = body.date || new Date().toISOString().slice(0, 10);

  if (!amount || !categoryId || !user) {
    return { statusCode: 400, body: JSON.stringify({ error: "חסרים שדות חובה: amount, categoryId, user" }) };
  }

  try {
    const getRes = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_KEY },
    });
    if (!getRes.ok) throw new Error("שליפת הנתונים נכשלה");
    const getJson = await getRes.json();
    const record = getJson.record;

    const newExpense = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      categoryId,
      amount: Number(amount),
      date,
      description: description || "",
      user,
      createdAt: Date.now(),
    };

    record.expenses = [...(record.expenses || []), newExpense];

    const putRes = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Master-Key": JSONBIN_KEY },
      body: JSON.stringify(record),
    });
    if (!putRes.ok) throw new Error("שמירת הנתונים נכשלה");

    return { statusCode: 200, body: JSON.stringify({ ok: true, expense: newExpense }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
