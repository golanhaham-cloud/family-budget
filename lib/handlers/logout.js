const A = require("../auth");
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return A.json(405, { error: "method" });
  if (!A.csrfOk(event)) return A.json(403, { error: "forbidden" });
  return A.json(200, { ok: true }, { "Set-Cookie": A.sessionCookie("", 0) });
};
