// The only way the app reads or writes the family data. Requires a valid session.
const A = require("../auth");
const { readState, writeState } = require("../state");
exports.handler = async function (event) {
  const denied = A.authorize(event);
  if (denied) return denied;
  if (event.httpMethod === "GET") {
    const s = await readState(event);
    return A.json(200, { version: s.version, data: s.data });
  }
  if (event.httpMethod === "PUT") {
    let body;
    try { body = JSON.parse(event.body || ""); } catch { return A.json(400, { error: "bad json" }); }
    const r = await writeState(event, body && body.data, body && body.baseVersion);
    return r.ok ? A.json(200, { version: r.version }) : A.json(r.status, { error: r.error, version: r.version });
  }
  return A.json(405, { error: "method" });
};
