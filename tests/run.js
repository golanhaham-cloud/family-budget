// Server-side tests with an in-memory store (globalThis.__FB_TEST_STORE).
// Run: npm test
const assert = require("assert");

process.env.SESSION_SECRET = "test-secret-" + "x".repeat(48);
process.env.FB_TEST = "1";

const A = require("../lib/auth");
process.env.BUDGET_PASSCODE_HASH = A.hashPasscode("main-secret");
process.env.BUDGET_ADMIN_PASSCODE_HASH = A.hashPasscode("admin-secret");
process.env.GEMINI_API_KEY = "test-key";

// Persistent per-name in-memory stores, shared across handlers like the real Blob store.
const stores = new Map();
globalThis.__FB_TEST_STORE = (name) => {
  if (!stores.has(name)) {
    const m = new Map();
    stores.set(name, {
      async get(k) { return m.has(k) ? m.get(k) : null; },
      async setJSON(k, v) { m.set(k, JSON.parse(JSON.stringify(v))); },
    });
  }
  return stores.get(name);
};

const login = require("../lib/handlers/login").handler;
const logout = require("../lib/handlers/logout").handler;
const data = require("../lib/handlers/data").handler;
const exportH = require("../lib/handlers/export").handler;
const households = require("../lib/handlers/households").handler;
const addExpense = require("../lib/handlers/add-expense").handler;
const checkBudget = require("../lib/handlers/check-budget").handler;
const advice = require("../lib/handlers/advice").handler;

let ipN = 0;
function ev(method, { cookie, body, bearer } = {}) {
  const headers = { "x-requested-with": "fb", "x-real-ip": `10.0.0.${++ipN}` };
  if (cookie) headers.cookie = cookie;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return { httpMethod: method, headers, body: body ? JSON.stringify(body) : "" };
}
const cookieFrom = (res) => String(res.headers["Set-Cookie"] || "").split(";")[0];
const json = (res) => JSON.parse(res.body || "{}");
const validData = (marker) => ({ categories: [], fixedExpenses: [], expenses: [], budgets: {}, marker });

async function doLogin(pass) {
  const r = await login(ev("POST", { body: { passcode: pass } }));
  return { res: r, cookie: cookieFrom(r), body: json(r) };
}

(async () => {
  // 1. wrong code -> 401, family code is never admin, dedicated admin code is
  let r = await doLogin("nope");
  assert.equal(r.res.statusCode, 401, "wrong code rejected");
  r = await doLogin("main-secret");
  assert.equal(r.res.statusCode, 200, "main login ok");
  assert.equal(r.body.admin, false, "family code is not admin when an admin code exists");
  const mainCookie = r.cookie;
  assert.ok(mainCookie.startsWith("__Host-fb_session="), "session cookie set");
  r = await doLogin("admin-secret");
  assert.equal(r.body.admin, true, "admin code is admin");
  assert.equal(r.body.household.key, "main", "admin code opens the main household");
  const adminCookie = r.cookie;
  let res = await households(ev("GET", { cookie: mainCookie }));
  assert.equal(res.statusCode, 403, "family session blocked from management");

  // 2. main data round-trip (advice enabled for main)
  res = await data(ev("GET", { cookie: mainCookie }));
  assert.equal(res.statusCode, 200);
  assert.equal(json(res).data, null, "main starts empty");
  assert.equal(json(res).adviceEnabled, true, "advice enabled for main");
  res = await data(ev("PUT", { cookie: mainCookie, body: { baseVersion: 0, data: validData("main") } }));
  assert.equal(res.statusCode, 200, "main write ok");

  // 3. admin creates an invitation (no name/code chosen by admin)
  res = await households(ev("POST", { cookie: adminCookie, body: {} }));
  assert.equal(res.statusCode, 200);
  const invite = json(res);
  assert.ok(invite.inviteCode && invite.inviteCode.length === 8, "invite code created");
  const inviteId = invite.household.id;

  // 4. invite code does not open a session; it starts first setup
  r = await doLogin(invite.inviteCode);
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.body.pending, true, "invite is pending setup");
  assert.ok(r.body.inviteToken, "invite token issued");
  assert.ok(!r.res.headers["Set-Cookie"], "no session before setup");
  const inviteToken = r.body.inviteToken;

  // 5. claim validation
  res = await households(ev("POST", { body: { inviteToken: "bad", name: "x", passcode: "1234" } }));
  assert.equal(res.statusCode, 401, "bad invite token rejected");
  res = await households(ev("POST", { body: { inviteToken, name: "משפחת לוי", passcode: "12" } }));
  assert.equal(res.statusCode, 400, "short code rejected");
  res = await households(ev("POST", { body: { inviteToken, name: "משפחת לוי", passcode: "main-secret" } }));
  assert.equal(res.statusCode, 409, "code clash with main rejected");
  res = await households(ev("POST", { body: { inviteToken, name: "משפחת לוי", passcode: "levi-secret", creditBillingDay: 35 } }));
  assert.equal(res.statusCode, 400, "bad billing day rejected");

  // 6. claim succeeds with full details -> immediate session
  res = await households(ev("POST", { body: {
    inviteToken, name: "משפחת לוי", passcode: "levi-secret",
    members: ["דני", "שרה", " דני "], creditBillingDay: 10, openingBalance: -800, openingBalanceDate: "2026-11-01",
  } }));
  assert.equal(res.statusCode, 200, "claim ok");
  assert.equal(json(res).household.name, "משפחת לוי");
  const leviCookie = cookieFrom(res);
  assert.ok(leviCookie.startsWith("__Host-fb_session="), "claim logs the family in");
  const leviId = json(res).household.key;

  // 7. invite code is one-time
  r = await doLogin(invite.inviteCode);
  assert.equal(r.res.statusCode, 401, "invite code cannot be reused");

  // 8. onboarding details arrive until the first save; then the family's own data
  res = await data(ev("GET", { cookie: leviCookie }));
  let body = json(res);
  assert.equal(body.data, null, "new family starts with no data");
  assert.deepEqual(body.initialSettings.members, ["דני", "שרה"], "members saved (deduped)");
  assert.equal(body.initialSettings.creditBillingDay, 10);
  assert.equal(body.initialSettings.openingBalance, -800);
  assert.equal(body.initialSettings.openingBalanceDate, "2026-11-01");
  assert.equal(body.admin, false, "new family is not admin");
  assert.equal(body.adviceEnabled, false, "advice disabled for other households");
  res = await data(ev("PUT", { cookie: leviCookie, body: { baseVersion: 0, data: validData("levi") } }));
  assert.equal(res.statusCode, 200);
  res = await data(ev("GET", { cookie: leviCookie }));
  body = json(res);
  assert.equal(body.data.marker, "levi");
  assert.ok(!body.initialSettings, "onboarding settings gone after first save");

  // 9. isolation both directions
  res = await data(ev("GET", { cookie: mainCookie }));
  assert.equal(json(res).data.marker, "main", "main unchanged");
  res = await exportH(ev("GET", { cookie: leviCookie }));
  assert.ok(res.body.includes('"levi"') && !res.body.includes('"main"'), "export scoped");

  // 10. non-admin cannot manage or invite
  res = await households(ev("GET", { cookie: leviCookie }));
  assert.equal(res.statusCode, 403);
  res = await households(ev("POST", { cookie: leviCookie, body: {} }));
  assert.equal(res.statusCode, 403);

  // 11. add-expense writes only into the caller's household
  res = await addExpense(ev("POST", { cookie: leviCookie, body: { amount: 42, categoryId: "c1", user: "דני" } }));
  assert.equal(res.statusCode, 200);
  res = await data(ev("GET", { cookie: mainCookie }));
  assert.equal((json(res).data.expenses || []).length, 0, "main untouched");
  res = await checkBudget(ev("GET", { cookie: leviCookie }));
  assert.equal(res.statusCode, 200);

  // 12. forged sessions rejected (hid and admin claim are signature-protected)
  const now = Math.floor(Date.now() / 1000);
  const forgedHid = Buffer.from(JSON.stringify({ hid: leviId, iat: now, exp: now + 3600 })).toString("base64url") + ".AAAA";
  res = await data(ev("GET", { cookie: `__Host-fb_session=${forgedHid}` }));
  assert.equal(res.statusCode, 401, "forged hid rejected");
  const forgedAdm = Buffer.from(JSON.stringify({ hid: "main", adm: true, iat: now, exp: now + 3600 })).toString("base64url") + ".AAAA";
  res = await households(ev("GET", { cookie: `__Host-fb_session=${forgedAdm}` }));
  assert.equal(res.statusCode, 401, "forged admin claim rejected");

  // 13. legacy session without claims maps to main and works
  const legacy = A.sign({ iat: now, exp: now + 3600 });
  res = await data(ev("GET", { cookie: `__Host-fb_session=${legacy}` }));
  assert.equal(res.statusCode, 200, "legacy session still works");
  assert.equal(json(res).data.marker, "main");

  // 14. advice: blocked for other households, reaches validation for main
  res = await advice(ev("POST", { cookie: leviCookie, body: { period: "2026-11" } }));
  assert.equal(res.statusCode, 403, "advice blocked for other households");
  res = await advice(ev("POST", { cookie: mainCookie, body: { period: "bad" } }));
  assert.equal(res.statusCode, 400, "advice reaches validation for main");

  // 15. disable blocks code and sessions, restore brings back the same code and data
  res = await households(ev("DELETE", { cookie: adminCookie, body: { id: leviId } }));
  assert.equal(res.statusCode, 200);
  r = await doLogin("levi-secret");
  assert.equal(r.res.statusCode, 401, "disabled code blocked");
  res = await data(ev("GET", { cookie: leviCookie }));
  assert.equal(res.statusCode, 401, "disabled household's session revoked");
  res = await households(ev("PUT", { cookie: adminCookie, body: { id: leviId } }));
  assert.equal(res.statusCode, 200);
  r = await doLogin("levi-secret");
  assert.equal(r.res.statusCode, 200, "restored code works again");
  res = await data(ev("GET", { cookie: r.cookie }));
  assert.equal(json(res).data.marker, "levi", "restored household keeps its data");

  // 16. fail closed: without a dedicated admin code nobody can manage households,
  // so a deployment without admin configuration exposes no registry writes at all
  delete process.env.BUDGET_ADMIN_PASSCODE_HASH;
  r = await doLogin("main-secret");
  assert.equal(r.body.admin, false, "no admin exists without an admin code");
  res = await households(ev("GET", { cookie: r.cookie }));
  assert.equal(res.statusCode, 403, "management closed without admin code");
  res = await households(ev("POST", { cookie: r.cookie, body: {} }));
  assert.equal(res.statusCode, 403, "invites closed without admin code");
  res = await households(ev("POST", { body: { inviteToken: A.sign({ invite: "abcdef012345", iat: now, exp: now + 3600 }), name: "z", passcode: "main-secret" } }));
  assert.equal(res.statusCode, 410, "unknown invite rejected before code checks");
  process.env.BUDGET_ADMIN_PASSCODE_HASH = A.hashPasscode("admin-secret");
  res = await households(ev("GET", { cookie: adminCookie }));
  assert.equal(res.statusCode, 200, "existing admin session manages once configured again");

  // 17. logout
  res = await logout(ev("POST", { cookie: mainCookie }));
  assert.equal(res.statusCode, 200);

  console.log("כל הבדיקות עברו ✔ (17 קבוצות בדיקה)");
})().catch((e) => { console.error("נכשל:", e); process.exit(1); });
