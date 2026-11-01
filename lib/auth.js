// Server-side authorization for every sensitive endpoint.
// Secrets live only in Netlify environment variables:
//   BUDGET_PASSCODE_HASH  scrypt$<saltHex>$<hashHex>   (never the passcode itself)
//   SESSION_SECRET        random 32+ bytes (hex/base64)
//   API_TOKEN             optional, only for automation (e.g. an iPhone shortcut)
const crypto = require("crypto");
const { openStore } = require("./store");

const COOKIE = "__Host-fb_session";
const SESSION_SECONDS = 30 * 24 * 3600;
const MAX_FAILS = 5, WINDOW_MS = 15 * 60 * 1000, LOCK_MS = 15 * 60 * 1000;

const json = (statusCode, obj, headers = {}) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  body: JSON.stringify(obj),
});
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const header = (event, name) => {
  const h = event.headers || {};
  const k = Object.keys(h).find((x) => x.toLowerCase() === name);
  return k ? h[k] : "";
};
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function hashPasscode(passcode, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
  const h = crypto.scryptSync(String(passcode), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${h.toString("hex")}`;
}
function verifyPasscode(passcode, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  return safeEqual(hashPasscode(passcode, parts[1]), stored);
}

function sign(payload) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET missing or too short");
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}
function verifyToken(token) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || !token) return null;
  const [body, mac] = String(token).split(".");
  if (!body || !mac) return null;
  const exp = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(mac, exp)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p && p.exp > Math.floor(Date.now() / 1000) ? p : null;
  } catch { return null; }
}
const sessionCookie = (token, maxAge) =>
  `${COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
function getCookie(event, name) {
  const raw = header(event, "cookie");
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

// CSRF defence in depth (SameSite=Strict is the main one): state-changing calls need a custom header
// and, when the browser sends Origin, it must match the host.
function csrfOk(event) {
  if (event.httpMethod === "GET" || event.httpMethod === "HEAD") return true;
  if (header(event, "x-requested-with") !== "fb") return false;
  const origin = header(event, "origin");
  if (!origin) return true;
  try { return new URL(origin).host === header(event, "host"); } catch { return false; }
}

// returns null when authorized, else an HTTP response. allowApiToken lets automation use a Bearer token.
function authorize(event, { allowApiToken = false } = {}) {
  // A valid Bearer token is not an ambient browser credential, so it needs no CSRF header (iOS Shortcuts etc.).
  if (allowApiToken && process.env.API_TOKEN && process.env.API_TOKEN.length >= 32) {
    const m = /^Bearer (.+)$/.exec(header(event, "authorization"));
    if (m && safeEqual(sha256(m[1]), sha256(process.env.API_TOKEN))) return null;
  }
  if (!csrfOk(event)) return json(403, { error: "forbidden" });
  if (verifyToken(getCookie(event, COOKIE))) return null;
  return json(401, { error: "unauthorized" });
}

// failed-login throttling, stored server-side per client IP (and globally)
async function throttle(event, ok) {
  const store = openStore(event, "auth");
  const ip = header(event, "x-real-ip") || (header(event, "x-forwarded-for").split(",")[0] || "").trim() || "unknown";
  const keys = [`fail/ip/${sha256(ip)}`, "fail/global"];
  const limits = [MAX_FAILS, MAX_FAILS * 6];
  const now = Date.now();
  const recs = await Promise.all(keys.map((k) => store.get(k, { type: "json" }).then((r) => r || { n: 0, first: now, lockUntil: 0 })));
  if (ok === undefined) { // check only
    const locked = recs.find((r) => r.lockUntil > now);
    return locked ? Math.ceil((locked.lockUntil - now) / 1000) : 0;
  }
  await Promise.all(keys.map((k, i) => {
    let r = recs[i];
    if (ok) return i === 0 && r.n > 0 ? store.setJSON(k, { n: 0, first: now, lockUntil: 0 }) : null;
    if (now - r.first > WINDOW_MS) r = { n: 0, first: now, lockUntil: 0 };
    r.n += 1;
    if (r.n >= limits[i]) r.lockUntil = now + LOCK_MS;
    return store.setJSON(k, r);
  }));
  return 0;
}

module.exports = { json, header, hashPasscode, verifyPasscode, sign, verifyToken, sessionCookie, authorize, throttle, COOKIE, SESSION_SECONDS, csrfOk };
