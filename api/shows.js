// K's Dramas — shows API for Vercel. No dependencies; talks to Upstash Redis over its REST API.
const crypto = require("crypto");

const KEY = "kdw:shows";
const STATUSES = ["Watching", "Up next", "Finished"];
const LIMITS = { title: 100, service: 40, watchUrl: 500, synopsis: 600, note: 300, poster: 40000, shows: 200 };
const ID_RE = /^[a-z0-9-]{8,40}$/;
const MAX_FAILS = 10;
const FAIL_WINDOW_SECONDS = 900;

function redisConfig(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(cmd) {
  const cfg = redisConfig(process.env);
  if (!cfg) throw new Error("storage not configured");
  const r = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: "Bearer " + cfg.token, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* fall through to the error below */ }
  if (!r.ok || j.error) throw new Error("storage error");
  return j.result;
}

function checkPasscode(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || !expected) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function validateShow(show) {
  if (!show || typeof show !== "object") return { ok: false, error: "Missing show." };
  const str = (x) => (x == null ? "" : typeof x === "string" ? x : null);
  const title = str(show.title), service = str(show.service), watchUrl = str(show.watchUrl);
  const synopsis = str(show.synopsis), poster = str(show.poster), note = str(show.note);
  if ([title, service, watchUrl, synopsis, poster, note].some((x) => x === null)) return { ok: false, error: "Fields must be text." };
  if (typeof show.id !== "string" || !ID_RE.test(show.id)) return { ok: false, error: "Bad id." };
  const t = title.trim();
  if (!t || t.length > LIMITS.title) return { ok: false, error: "Bad title." };
  if (service.trim().length > LIMITS.service) return { ok: false, error: "Service name too long." };
  if (synopsis.trim().length > LIMITS.synopsis) return { ok: false, error: "Summary too long." };
  if (note.trim().length > LIMITS.note) return { ok: false, error: "Note too long." };
  const url = watchUrl.trim();
  if (url.length > LIMITS.watchUrl) return { ok: false, error: "Link too long." };
  if (/^(javascript|data|vbscript):/.test(url.replace(/[\u0000-\u0020\u007f]/g, "").toLowerCase())) return { ok: false, error: "That link type is not allowed." };
  if (poster && (poster.indexOf("data:image/jpeg;base64,") !== 0 || poster.length > LIMITS.poster)) return { ok: false, error: "Bad poster." };
  if (STATUSES.indexOf(show.status) < 0) return { ok: false, error: "Bad status." };
  const addedAt = Number.isFinite(show.addedAt) ? show.addedAt : Date.now();
  return { ok: true, show: { id: show.id, title: t, service: service.trim(), watchUrl: url, synopsis: synopsis.trim(), poster, status: show.status, fromBaba: show.fromBaba === true, note: note.trim(), addedAt } };
}

async function handler(req, res) {
  if (res.setHeader) res.setHeader("Cache-Control", "no-store");
  const method = req.method;
  if (method !== "GET" && method !== "PUT" && method !== "DELETE") return res.status(405).json({ error: "Method not allowed." });
  try {
    const headers = req.headers || {};
    const ip = String(headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    const failKey = "kdw:fail:" + ip;
    const fails = Number(await redis(["GET", failKey])) || 0;
    if (fails >= MAX_FAILS) return res.status(429).json({ error: "Too many tries. Please wait a few minutes." });
    if (!checkPasscode(headers["x-passcode"], process.env.SHOWS_PASSCODE)) {
      await redis(["INCR", failKey]);
      await redis(["EXPIRE", failKey, FAIL_WINDOW_SECONDS]); // every failure, so a lost first call can never leave a permanent lockout
      return res.status(401).json({ error: "Wrong passcode." });
    }

    if (method === "GET") {
      const flat = (await redis(["HGETALL", KEY])) || [];
      const shows = [];
      for (let i = 1; i < flat.length; i += 2) {
        try {
          const s = JSON.parse(flat[i]);
          if (s && typeof s === "object" && typeof s.id === "string") shows.push(s);
        } catch (e) { /* skip corrupt row */ }
      }
      return res.status(200).json({ shows });
    }

    if (method === "PUT") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
      const v = validateShow(body && body.show);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const exists = Number(await redis(["HEXISTS", KEY, v.show.id]));
      if (!exists && Number(await redis(["HLEN", KEY])) >= LIMITS.shows) return res.status(400).json({ error: "The list is full (200 shows)." });
      await redis(["HSET", KEY, v.show.id, JSON.stringify(v.show)]);
      return res.status(200).json({ show: v.show });
    }

    const id = req.query && req.query.id;
    if (typeof id !== "string" || !ID_RE.test(id)) return res.status(400).json({ error: "Bad id." });
    await redis(["HDEL", KEY, id]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

module.exports = handler;
module.exports.validateShow = validateShow;
module.exports.checkPasscode = checkPasscode;
