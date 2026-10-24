#!/usr/bin/env node
// Serve the production build with the real /api/bitcoin-data function, like Netlify does.
// Usage: npm run build && node scripts/serve-local.mjs [port]   (default 5190, binds 127.0.0.1)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const { handler } = createRequire(import.meta.url)(path.join(ROOT, 'netlify', 'functions', 'bitcoin-data.js'));
const PORT = Number(process.argv[2] || 5190);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.csv': 'text/csv', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/bitcoin-data') {
    const result = await handler();
    res.writeHead(result.statusCode, result.headers);
    return res.end(result.body);
  }
  const file = path.join(BUILD, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  const target = file.startsWith(BUILD) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(BUILD, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`Serving build + function on http://127.0.0.1:${PORT}`));
