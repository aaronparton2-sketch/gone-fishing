/** GET /api/leaderboard?group=BOYS  - public, read-only, safe fields only. */
const L = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return L.send(res, 405, { error: 'GET only' });
  if (!L.configured(res)) return;

  const group = L.clean((req.query && req.query.group) || 'BOYS', L.LIMITS.group_code).toUpperCase();
  if (!/^[A-Z0-9-]{3,16}$/.test(group)) return L.send(res, 400, { error: 'bad group code' });

  const g = await L.sb(`gf_groups?select=code,name&code=eq.${encodeURIComponent(group)}&limit=1`);
  if (!g.ok || !Array.isArray(g.body) || !g.body.length) return L.send(res, 404, { error: 'No crew with that code.' });

  // Note the embedded select: PostgREST resolves the FK, so this is one round trip.
  const a = await L.sb(
    `gf_anglers?select=id,name,photo,favourite_fish,created_at,gf_catches(species,length_cm,points,caught_at)` +
    `&group_code=eq.${encodeURIComponent(group)}&order=created_at.asc&limit=200`);
  if (!a.ok) return L.send(res, 502, { error: 'Could not reach the board.' });

  const anglers = (a.body || []).map((r) => {
    const catches = r.gf_catches || [];
    const best = catches.reduce((m, c) => (c.length_cm > (m ? m.length_cm : -1) ? c : m), null);
    return {
      id: r.id,
      name: r.name,
      photo: r.photo || null,
      favourite_fish: r.favourite_fish || null,
      catches: catches.length,
      points: catches.reduce((n, c) => n + (c.points || 0), 0),
      best: best ? { species: best.species, length_cm: best.length_cm } : null,
      last: catches.length
        ? catches.map((c) => c.caught_at).sort().slice(-1)[0]
        : null,
    };
  });

  // most points first, then the bigger fish, then whoever has fished more
  anglers.sort((x, y) => y.points - x.points
    || (y.best ? y.best.length_cm : 0) - (x.best ? x.best.length_cm : 0)
    || y.catches - x.catches);
  anglers.forEach((r, i) => { r.rank = i + 1; });

  return L.send(res, 200, {
    group: { code: g.body[0].code, name: g.body[0].name },
    updated_at: new Date().toISOString(),
    anglers,
  });
};
