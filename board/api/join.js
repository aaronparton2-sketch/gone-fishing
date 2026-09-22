/** POST /api/join  { name, favourite_fish, group_code, photo } */
const L = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { error: 'POST only' });
  if (!L.configured(res)) return;

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const name = L.clean(b.name, L.LIMITS.name);
  const fish = L.clean(b.favourite_fish, L.LIMITS.favourite_fish);
  const group = L.clean(b.group_code, L.LIMITS.group_code).toUpperCase();

  if (name.length < 2) return L.send(res, 400, { error: 'Give us a name.' });
  if (!/^[A-Z0-9-]{3,16}$/.test(group)) return L.send(res, 400, { error: 'Group code is letters and numbers, 3 to 16 characters.' });

  const photo = L.checkPhoto(b.photo);
  if (!photo.ok) return L.send(res, 400, { error: photo.why });

  const hash = L.ipHash(L.clientIp(req));
  const since = new Date(Date.now() - 3600e3).toISOString();

  const mine = await L.countRows(`gf_anglers?select=id&ip_hash=eq.${hash}&created_at=gte.${since}`);
  if (mine >= L.JOIN_PER_IP_PER_HOUR) return L.send(res, 429, { error: 'Slow down. Try again later.' });
  const all = await L.countRows(`gf_anglers?select=id&created_at=gte.${since}`);
  if (all >= L.JOIN_GLOBAL_PER_HOUR) return L.send(res, 429, { error: 'The board is busy. Try again shortly.' });

  // the group must already exist - anyone can join a crew, nobody can spray new ones
  const g = await L.sb(`gf_groups?select=code,name&code=eq.${encodeURIComponent(group)}&limit=1`);
  if (!g.ok) return L.send(res, 502, { error: 'Could not reach the board.' });
  if (!Array.isArray(g.body) || !g.body.length) return L.send(res, 404, { error: 'No crew with that code.' });

  const ins = await L.sb('gf_anglers', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ group_code: group, name, favourite_fish: fish || null,
                            photo: photo.value, ip_hash: hash }]),
  });
  if (ins.status === 409) return L.send(res, 409, { error: 'That name is already on this board.' });
  if (!ins.ok) return L.send(res, 502, { error: 'Could not add you to the board.' });

  const row = Array.isArray(ins.body) ? ins.body[0] : null;
  return L.send(res, 200, { ok: true, angler: { id: row && row.id, name, group_code: group, group_name: g.body[0].name } });
};
