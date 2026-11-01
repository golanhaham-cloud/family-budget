const A = require("../auth");
const H = require("../households");
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return A.json(405, { error: "method" });
  if (!A.csrfOk(event)) return A.json(403, { error: "forbidden" });
  if (!process.env.SESSION_SECRET) return A.json(503, { error: "not configured" });
  const wait = await A.throttle(event);
  if (wait) return A.json(429, { error: "too many attempts", retryAfter: wait }, { "Retry-After": String(wait) });
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const pass = typeof body.passcode === "string" ? body.passcode.slice(0, 200) : "";
  const hs = await H.allHouseholds(event);
  if (hs.length === 0) return A.json(503, { error: "not configured" });
  // Always verify against the admin hash too, whatever matched below, so the
  // attempt cost does not reveal whether a dedicated admin code exists.
  const adminHash = process.env.BUDGET_ADMIN_PASSCODE_HASH || "";
  const isAdminCode = !!(pass && adminHash && A.verifyPasscode(pass, adminHash));
  const match = pass ? await H.findByPasscode(event, pass) : null;
  // A pending invitation code: not a session yet - a 30-minute token for the
  // first-setup screen, where the family chooses its own code and details.
  if (!isAdminCode && !match && pass) {
    const invite = await H.findInviteByCode(event, pass);
    if (invite) {
      await A.throttle(event, true);
      const t = Math.floor(Date.now() / 1000);
      return A.json(200, { ok: true, pending: true, inviteToken: A.sign({ invite: invite.id, iat: t, exp: t + 1800 }) });
    }
  }
  const hid = isAdminCode ? "main" : match && match.id;
  if (!hid) {
    await A.throttle(event, false);
    if (!process.env.FB_TEST) await new Promise((r) => setTimeout(r, 500));
    return A.json(401, { error: "invalid" });
  }
  const household = isAdminCode ? H.mainHousehold() : match;
  const adm = isAdminCode; // no admin exists without a dedicated admin code (fail closed)
  await A.throttle(event, true);
  const now = Math.floor(Date.now() / 1000);
  const token = A.sign({ hid, adm, iat: now, exp: now + A.SESSION_SECONDS });
  return A.json(200, { ok: true, household: { name: household.name, key: hid }, admin: adm }, { "Set-Cookie": A.sessionCookie(token, A.SESSION_SECONDS) });
};
