/**
 * POST /api/catch   { group_code, angler, species, length_cm, photo }
 * Header: x-davo-secret
 *
 * Machine-only: this is what n8n calls once Davo has identified the fish. It is
 * behind a shared secret precisely so nobody can post themselves a 90cm mulloway.
 */
const L = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { error: 'POST only' });
  if (!L.configured(res)) return;
  if (!L.secretOk(req.headers['x-davo-secret'])) return L.send(res, 401, { error: 'nope' });

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const group = L.clean(b.group_code, L.LIMITS.group_code).toUpperCase();
  const angler = L.clean(b.angler, L.LIMITS.name);
  const species = L.clean(b.species, L.LIMITS.species);
  const len = Number(b.length_cm);

  if (!group || !angler || !species) return L.send(res, 400, { error: 'group_code, angler and species are required' });
  if (!Number.isFinite(len) || len <= 0 || len > 400) return L.send(res, 400, { error: 'length_cm must be 1-400' });

  const photo = L.checkPhoto(b.photo);
  if (!photo.ok) return L.send(res, 400, { error: photo.why });

  const a = await L.sb(`gf_anglers?select=id&group_code=eq.${encodeURIComponent(group)}` +
                       `&name=ilike.${encodeURIComponent(angler)}&limit=1`);
  if (!a.ok) return L.send(res, 502, { error: 'lookup failed' });
  if (!Array.isArray(a.body) || !a.body.length) return L.send(res, 404, { error: 'angler not on that board' });

  // Points are just the length in centimetres. Simple, and impossible to argue with.
  const points = Math.round(len);
  const ins = await L.sb('gf_catches', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ angler_id: a.body[0].id, species, length_cm: len, points, photo: photo.value }]),
  });
  if (!ins.ok) return L.send(res, 502, { error: 'could not record the catch' });

  return L.send(res, 200, { ok: true, angler, species, length_cm: len, points });
};
