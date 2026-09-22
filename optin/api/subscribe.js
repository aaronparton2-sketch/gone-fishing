/**
 * POST /api/subscribe { name, email }
 * Stores the lead (service-role, server-side) and returns the repo link.
 *
 * Same hardening as the swell-event opt-in, because a viral comment section is a
 * traffic event: per-IP and global hourly caps, hashed IPs, length caps, and it
 * fails OPEN on a count hiccup so a real person is never blocked.
 */
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REPO_URL = process.env.DAVO_REPO_URL || 'https://github.com/aaronparton2-sketch/gone-fishing';
const IP_CAP_1H = 8;
const GLOBAL_CAP_1H = 400;

const SB = () => (process.env.GF_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = () => process.env.GF_SUPABASE_SERVICE_KEY || '';

const ip = (req) => (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown');
const hash = (s) => crypto.createHash('sha256').update('davo::' + s).digest('hex');
const clean = (v, n) => String(v == null ? '' : v)
  .replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

function send(res, code, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(code).send(JSON.stringify(obj));
}

async function sb(path, opts = {}) {
  const r = await fetch(`${SB()}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`,
               'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const t = await r.text();
  let body = null; try { body = t ? JSON.parse(t) : null; } catch { body = t; }
  return { ok: r.ok, status: r.status, body, headers: r.headers };
}
async function count(q) {
  try {
    const r = await sb(q, { method: 'HEAD', headers: { Prefer: 'count=exact', Range: '0-0' } });
    const n = (r.headers.get('content-range') || '').split('/')[1];
    return n && n !== '*' ? parseInt(n, 10) || 0 : 0;
  } catch { return 0; }            // fail open, never block a real signup
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!SB() || !KEY()) return send(res, 503, { error: 'server not configured' });

  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const name = clean(b.name, 60);
  const email = clean(b.email, 120).toLowerCase();
  if (name.length < 2) return send(res, 400, { error: 'Pop your name in.' });
  if (!EMAIL_RE.test(email)) return send(res, 400, { error: "That email doesn't look right." });

  const h = hash(ip(req));
  const since = new Date(Date.now() - 3600e3).toISOString();
  if (await count(`gf_leads?select=id&ip_hash=eq.${h}&created_at=gte.${since}`) >= IP_CAP_1H)
    return send(res, 429, { error: 'Slow down a sec.' });
  if (await count(`gf_leads?select=id&created_at=gte.${since}`) >= GLOBAL_CAP_1H)
    return send(res, 429, { error: 'Bit busy right now, try again shortly.' });

  const ins = await sb('gf_leads', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{ name, email, ip_hash: h, source: 'davo' }]),
  });
  // 409 = already signed up. Still give them the link; they asked twice.
  if (!ins.ok && ins.status !== 409) return send(res, 502, { error: 'Could not save that.' });

  return send(res, 200, { ok: true, name, repo: REPO_URL, returning: ins.status === 409 });
};
