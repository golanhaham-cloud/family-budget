// Authenticated backup download of the household's own data document (a read, no storage write).
const A = require("../auth");
const H = require("../households");
const { readState } = require("../state");
exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return A.json(405, { error: "method" });
  const denied = A.authorize(event);
  if (denied) return denied;
  const hid = A.householdId(event);
  const me = await H.findById(event, hid);
  if (!me) return A.json(401, { error: "unauthorized" });
  const s = await readState(event, hid);
  if (!s.data) return A.json(404, { error: "no data" });
  const day = new Date().toISOString().slice(0, 10);
  return { statusCode: 200, body: JSON.stringify(s.data, null, 1),
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="family-budget-backup-${day}.json"`, "X-Data-Version": String(s.version) } };
};
