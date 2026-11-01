// Household management for the site owner (isAdminSession from the signed session -
// never a display name) plus the one-time invitation claim flow for new families.
// - POST (admin): create an invitation; the family picks its own details on first entry.
// - POST {inviteToken,...} (invitee): first setup - family name, own code, members,
//   optional billing day and opening balance. The invite code is one-time.
// - DELETE/PUT (admin): disable / restore. Data is never deleted; restoring brings
//   back the same code and data.
const A = require("../auth");
const H = require("../households");

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

async function clashExists(event, pass) {
  const clash = await H.findByPasscode(event, pass);
  if (clash) return true;
  const adminHash = process.env.BUDGET_ADMIN_PASSCODE_HASH || "";
  if (adminHash && A.verifyPasscode(pass, adminHash)) return true;
  const invite = await H.findInviteByCode(event, pass);
  return !!invite;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST" && event.httpMethod !== "DELETE" && event.httpMethod !== "PUT")
    return A.json(405, { error: "method" });

  let body = {};
  if (event.httpMethod !== "GET") {
    try { body = JSON.parse(event.body || "{}"); } catch { return A.json(400, { error: "bad json" }); }
  }

  // --- invitee first setup: the signed invite token is the authority, no session needed ---
  if (event.httpMethod === "POST" && typeof body.inviteToken === "string") {
    if (!A.csrfOk(event)) return A.json(403, { error: "forbidden" });
    const p = A.verifyToken(body.inviteToken);
    if (!p || typeof p.invite !== "string") return A.json(401, { error: "קישור ההצטרפות פג. בקשו קוד חדש" });
    const reg = await H.loadRegistry(event);
    const entry = reg.find((h) => h.id === p.invite);
    if (!entry || !entry.pending || entry.disabled) return A.json(410, { error: "ההזמנה הזו כבר נוצלה או בוטלה. בקשו קוד חדש" });

    const name = str(body.name, 40);
    if (!name) return A.json(400, { error: "חסר שם משפחה" });
    const pass = str(body.passcode, 200);
    if (pass.length < 4) return A.json(400, { error: "הקוד צריך להיות בין 4 ל-200 תווים" });
    if (await clashExists(event, pass)) return A.json(409, { error: "הקוד הזה כבר בשימוש. בחרו קוד אחר" });
    const members = Array.isArray(body.members)
      ? [...new Set(body.members.map((m) => str(m, 30)).filter(Boolean))].slice(0, 10) : [];
    const settings = {};
    if (members.length) settings.members = members;
    if (body.creditBillingDay !== "" && body.creditBillingDay != null) {
      const d = Number(body.creditBillingDay);
      if (!Number.isInteger(d) || d < 1 || d > 28) return A.json(400, { error: "יום חיוב האשראי צריך להיות 1 עד 28" });
      settings.creditBillingDay = d;
    }
    if (body.openingBalance !== "" && body.openingBalance != null) {
      const b = Number(body.openingBalance);
      if (!Number.isFinite(b)) return A.json(400, { error: "יתרת פתיחה לא תקינה" });
      settings.openingBalance = Math.round(b * 100) / 100;
      if (body.openingBalanceDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.openingBalanceDate)) return A.json(400, { error: "תאריך יתרה לא תקין" });
        settings.openingBalanceDate = body.openingBalanceDate;
      }
    }

    entry.pending = false;
    entry.name = name;
    entry.passcodeHash = A.hashPasscode(pass);
    entry.createdAt = new Date().toISOString();
    delete entry.inviteCode;
    if (Object.keys(settings).length) entry.initialSettings = settings;
    await H.saveRegistry(event, reg);

    const now = Math.floor(Date.now() / 1000);
    const token = A.sign({ hid: entry.id, adm: false, iat: now, exp: now + A.SESSION_SECONDS });
    return A.json(200, { ok: true, household: { name, key: entry.id }, admin: false }, { "Set-Cookie": A.sessionCookie(token, A.SESSION_SECONDS) });
  }

  // --- everything below is site-owner only ---
  const denied = A.authorize(event);
  if (denied) return denied;
  if (!A.isAdminSession(event)) return A.json(403, { error: "אין הרשאת ניהול" });

  if (event.httpMethod === "GET") {
    const hs = await H.allHouseholds(event);
    return A.json(200, {
      households: hs.map((h) => ({
        id: h.id, name: h.name, admin: !!h.admin, disabled: !!h.disabled, pending: !!h.pending,
        inviteCode: h.pending ? h.inviteCode : undefined, createdAt: h.createdAt || null,
      })),
    });
  }

  if (event.httpMethod === "POST") {
    const reg = await H.loadRegistry(event);
    if (reg.length >= H.MAX_HOUSEHOLDS) return A.json(429, { error: "הגעת למספר המשפחות המקסימלי" });
    // One-time invitation: the family will pick its own name and code on first entry.
    let inviteCode;
    do { inviteCode = H.generateCode(8); } while (await clashExists(event, inviteCode));
    const entry = { id: H.newId(), pending: true, inviteCode, createdAt: new Date().toISOString() };
    await H.saveRegistry(event, [...reg, entry]);
    return A.json(200, { ok: true, household: { id: entry.id, pending: true }, inviteCode });
  }

  // DELETE = disable, PUT = restore. Data always kept.
  const id = str(body.id, 20);
  if (id === "main") return A.json(400, { error: "אי אפשר להשבית את המשפחה הראשית" });
  const reg = await H.loadRegistry(event);
  const entry = reg.find((h) => h.id === id);
  if (!entry) return A.json(404, { error: "המשפחה לא נמצאה" });
  entry.disabled = event.httpMethod === "DELETE";
  await H.saveRegistry(event, reg);
  return A.json(200, { ok: true, disabled: entry.disabled, dataKept: true });
};
