// Multi-household registry: every family gets its own id, display name and passcode hash,
// and the server ties each session to exactly one household.
// The main household comes from env (BUDGET_PASSCODE_HASH) so an existing single-family
// deployment keeps working with no data migration; additional households live in the
// private store under "households/registry".
const crypto = require("crypto");
const A = require("./auth");
const { openStore } = require("./store");

const REG_KEY = "households/registry";
const MAX_HOUSEHOLDS = 50;
const ID_RE = /^[a-f0-9]{12}$/;

function mainHousehold() {
  if (!process.env.BUDGET_PASSCODE_HASH) return null;
  return {
    id: "main",
    name: process.env.BUDGET_MAIN_NAME || "המשפחה שלי",
    passcodeHash: process.env.BUDGET_PASSCODE_HASH,
    admin: true,
  };
}

async function loadRegistry(event) {
  const store = openStore(event, "family-budget");
  const rec = await store.get(REG_KEY);
  const list = rec && Array.isArray(rec.households) ? rec.households : [];
  return list.filter(
    (h) => h && ID_RE.test(String(h.id || "")) &&
      ((h.pending === true && typeof h.inviteCode === "string") ||
        (typeof h.name === "string" && typeof h.passcodeHash === "string"))
  );
}

async function saveRegistry(event, households) {
  const store = openStore(event, "family-budget");
  await store.setJSON(REG_KEY, { households, updatedAt: new Date().toISOString() });
}

async function allHouseholds(event) {
  const reg = await loadRegistry(event);
  const main = mainHousehold();
  return main ? [main, ...reg] : reg;
}

async function findById(event, id) {
  if (id === "main") return mainHousehold();
  if (!ID_RE.test(String(id || ""))) return null;
  const reg = await loadRegistry(event);
  const h = reg.find((x) => x.id === id);
  return h && !h.disabled ? h : null;
}

// Pending invitation whose one-time code matches pass (constant-effort like passcodes).
async function findInviteByCode(event, pass) {
  const reg = await loadRegistry(event);
  let match = null;
  for (const h of reg) {
    if (!h.pending || h.disabled || typeof h.inviteCode !== "string") continue;
    if (A.safeEqualString(pass, h.inviteCode)) match = h;
  }
  return match;
}

// No early exit on match: verifying against every entry keeps the number of
// households and the matching position from leaking through timing.
async function findByPasscode(event, pass) {
  const hs = await allHouseholds(event);
  let match = null;
  for (const h of hs) if (!h.disabled && A.verifyPasscode(pass, h.passcodeHash)) match = h;
  return match;
}

const newId = () => crypto.randomBytes(6).toString("hex");

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // without look-alike characters
function generateCode(len = 8) {
  const b = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s;
}
const generatePasscode = () => generateCode(8);

const validId = (id) => id === "main" || ID_RE.test(String(id || ""));

module.exports = {
  mainHousehold, loadRegistry, saveRegistry, allHouseholds,
  findById, findByPasscode, findInviteByCode, newId, generatePasscode, generateCode, validId, MAX_HOUSEHOLDS,
};
