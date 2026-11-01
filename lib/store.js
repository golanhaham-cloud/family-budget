// Data store behind a tiny interface: get(key,{type:"json"}) / setJSON(key,value).
// - tests inject globalThis.__FB_TEST_STORE
// - STORE_BACKEND=blob : Vercel Blob PRIVATE store (token/OIDC from the project, never in the repo)
// Production backend choice (Redis vs Blob) is still open; only this file changes.
function blobStore(name) {
  const { put, get } = require("@vercel/blob");
  const path = (k) => `${name}/${k}.json`;
  return {
    async get(key) {
      const r = await get(path(key), { access: "private", useCache: false }).catch((e) => { if (/not.?found/i.test(String(e && e.message))) return null; throw e; });
      if (!r || r.statusCode === 404 || !r.stream) return null;
      return JSON.parse(await new Response(r.stream).text());
    },
    async setJSON(key, value) {
      await put(path(key), JSON.stringify(value), { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json" });
    },
  };
}
function openStore(event, name) {
  if (globalThis.__FB_TEST_STORE) return globalThis.__FB_TEST_STORE(name);
  if (process.env.STORE_BACKEND === "blob") return blobStore(name);
  throw new Error("no store configured");
}
module.exports = { openStore };
