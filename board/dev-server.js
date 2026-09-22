/** Local dev server: serves public/ and routes /api/* to the Vercel-style handlers. */
const http = require('http'), fs = require('fs'), path = require('path');
require('./load-env');

const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (b) => res.end(b);

  if (u.pathname.startsWith('/api/')) {
    const name = u.pathname.slice(5).replace(/[^a-z]/gi, '');
    let mod;
    try { mod = require('./api/' + name + '.js'); }
    catch { res.statusCode = 404; return res.end('{"error":"no such endpoint"}'); }
    req.query = Object.fromEntries(u.searchParams);
    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8');
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    }
    try { return await mod(req, res); }
    catch (e) { res.statusCode = 500; return res.end(JSON.stringify({error:String(e)})); }
  }

  const f = u.pathname === '/' ? '/index.html' : u.pathname;
  const p = path.join(__dirname, 'public', f);
  if (!p.startsWith(path.join(__dirname, 'public'))) { res.statusCode = 403; return res.end('no'); }
  fs.readFile(p, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
    res.end(data);
  });
});
const PORT = process.env.PORT || 5273;
srv.listen(PORT, () => console.log('DAVO board dev server on http://localhost:' + PORT));
