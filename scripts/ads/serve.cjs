// node serve.cjs [port]   public/ over http (8850), for deskcap.cjs: the website's pages as files, no API.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jsx': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const f = path.join(ROOT, path.normalize(decodeURIComponent(req.url.split('?')[0])));
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(Number(process.argv[2]) || 8850, '127.0.0.1', () => console.log('public/ on', Number(process.argv[2]) || 8850));
