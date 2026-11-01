// Shared read/write of one household's data document with version checking.
// Every household has its own document: the main household keeps the original
// "state" key (no migration), other households live under "households/<id>/".
const { openStore } = require("./store");
const stateKey = (hid) => (hid === "main" ? "state" : `households/${hid}/state`);
const MAX_BYTES = 2 * 1024 * 1024;
// Safeguard for the free Blob quota (2,000 advanced ops/month on Hobby): cap saves per hour and per month.
const MAX_PER_HOUR = Number(process.env.MAX_WRITES_PER_HOUR) || 60;
const MAX_PER_MONTH = Number(process.env.MAX_WRITES_PER_MONTH) || 1200;
const validShape = (d) => d && typeof d === "object" && !Array.isArray(d) &&
  Array.isArray(d.categories) && Array.isArray(d.fixedExpenses) && Array.isArray(d.expenses);

async function readState(event, hid = "main") {
  const store = openStore(event, "family-budget");
  const rec = await store.get(stateKey(hid), { type: "json" });
  return { store, version: rec ? rec.version : 0, data: rec ? rec.data : null, rate: rec ? rec.rate : null };
}
// returns {ok:true, version} or {ok:false, status, error, version?}
async function writeState(event, hid, data, baseVersion) {
  if (!validShape(data)) return { ok: false, status: 400, error: "invalid data shape" };
  if (Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) return { ok: false, status: 413, error: "too large" };
  const cur = await readState(event, hid);
  if (Number(baseVersion) !== cur.version) return { ok: false, status: 409, error: "conflict", version: cur.version };
  const nowIso = new Date().toISOString();
  const hour = nowIso.slice(0, 13), month = nowIso.slice(0, 7);
  const prev = cur.rate || {};
  const rate = { hour, hn: prev.hour === hour ? (prev.hn || 0) + 1 : 1, month, mn: prev.month === month ? (prev.mn || 0) + 1 : 1 };
  if (prev.hour === hour && (prev.hn || 0) >= MAX_PER_HOUR) return { ok: false, status: 429, error: "rate", version: cur.version };
  if (prev.month === month && (prev.mn || 0) >= MAX_PER_MONTH) return { ok: false, status: 429, error: "rate", version: cur.version };
  const next = { version: cur.version + 1, updatedAt: nowIso, rate, data };
  await cur.store.setJSON(stateKey(hid), next);
  return { ok: true, version: next.version };
}
module.exports = { readState, writeState, validShape, stateKey, MAX_BYTES };
