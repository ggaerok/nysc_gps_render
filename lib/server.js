// Vercel 이 아닌 곳(로컬 개발, Render)에서 같은 페이지와 API 를 제공하는 Node 서버.
//   /  관리 페이지   /location  GPS 페이지   /api/status, /api/auth
// Vercel 의 cleanUrls 처럼 '/location' 요청에 public/location.html 을 돌려준다.
const http = require('http'), fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const api = { '/api/status': require('../api/status'), '/api/auth': require('../api/auth') };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const MAX_BODY = 4096;

function start(port, host) {
  const server = http.createServer((req, res) => {
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { res.statusCode = 400; return res.end(); }

    if (api[pathname]) {
      const chunks = []; let size = 0;
      req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { res.statusCode = 413; res.end(); req.destroy(); } else chunks.push(c); });
      return req.on('end', () => {
        if (res.writableEnded) return;
        const raw = Buffer.concat(chunks).toString();
        if (raw) { try { req.body = JSON.parse(raw); } catch (e) { req.body = {}; } }
        Promise.resolve(api[pathname](req, res)).catch(() => { if (!res.writableEnded) { res.statusCode = 500; res.end('error'); } });
      });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
    if (pathname.endsWith('.html')) { res.statusCode = 404; return res.end('not found'); }   // cleanUrls: .html 주소는 쓰지 않음
    let p = pathname === '/' ? '/index' : pathname;
    if (!path.extname(p)) p += '.html';
    const file = path.join(pub, path.normalize(p));
    if (!file.startsWith(pub + path.sep)) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  });
  server.listen(port, host, () => console.log('listening on http://' + (host || 'localhost') + ':' + port));
  return server;
}
module.exports = { start };
