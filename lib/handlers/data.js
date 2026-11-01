// The only way the app reads or writes its household's data. Requires a valid session;
// the household comes from the signed session, never from the client.
const A = require("../auth");
const H = require("../households");
const { readState, writeState } = require("../state");
exports.handler = async function (event) {
  const denied = A.authorize(event);
  if (denied) return denied;
  const hid = A.householdId(event);
  const me = await H.findById(event, hid);
  if (!me) return A.json(401, { error: "unauthorized" });
  if (event.httpMethod === "GET") {
    const s = await readState(event, hid);
    const out = { version: s.version, data: s.data, household: { name: me.name, key: hid }, admin: A.isAdminSession(event), adviceEnabled: hid === "main" || process.env.ADVICE_FOR_ALL === "1" };
    // Details the family chose at first setup, until their first save lands.
    if (!s.data && me.initialSettings && typeof me.initialSettings === "object") out.initialSettings = me.initialSettings;
    return A.json(200, out);
  }
  if (event.httpMethod === "PUT") {
    let body;
    try { body = JSON.parse(event.body || ""); } catch { return A.json(400, { error: "bad json" }); }
    const r = await writeState(event, hid, body && body.data, body && body.baseVersion);
    return r.ok ? A.json(200, { version: r.version }) : A.json(r.status, { error: r.error, version: r.version });
  }
  return A.json(405, { error: "method" });
};
