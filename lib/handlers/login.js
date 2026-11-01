const A = require("../auth");
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return A.json(405, { error: "method" });
  if (!A.csrfOk(event)) return A.json(403, { error: "forbidden" });
  if (!process.env.BUDGET_PASSCODE_HASH || !process.env.SESSION_SECRET) return A.json(503, { error: "not configured" });
  const wait = await A.throttle(event);
  if (wait) return A.json(429, { error: "too many attempts", retryAfter: wait }, { "Retry-After": String(wait) });
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const pass = typeof body.passcode === "string" ? body.passcode.slice(0, 200) : "";
  if (!pass || !A.verifyPasscode(pass, process.env.BUDGET_PASSCODE_HASH)) {
    await A.throttle(event, false);
    if (!process.env.FB_TEST) await new Promise((r) => setTimeout(r, 500));
    return A.json(401, { error: "invalid" });
  }
  await A.throttle(event, true);
  const now = Math.floor(Date.now() / 1000);
  const token = A.sign({ iat: now, exp: now + A.SESSION_SECONDS });
  return A.json(200, { ok: true }, { "Set-Cookie": A.sessionCookie(token, A.SESSION_SECONDS) });
};
