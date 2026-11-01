// Runs a platform-neutral handler({httpMethod, headers, body}) -> {statusCode, headers, body} on Vercel (Node).
module.exports = (handler) => async (req, res) => {
  try {
    let body = "";
    if (req.body !== undefined && req.body !== null) body = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
    else { const chunks = []; for await (const c of req) chunks.push(c); body = Buffer.concat(chunks).toString(); }
    const out = await handler({ httpMethod: req.method, headers: req.headers, body });
    res.statusCode = out.statusCode;
    for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
    res.end(out.body || "");
  } catch (e) {
    console.error(e);
    res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "server error" }));
  }
};
