#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEnvFile } = require('./load-env');

loadEnvFile();

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 5173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8'
};
function safePath(urlPath){
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(ROOT, clean);
  if(!target.startsWith(ROOT)) return null;
  return target;
}
const server = http.createServer((req, res) => {
  let file = safePath(req.url);
  if(!file){ res.writeHead(403); return res.end('Forbidden'); }
  if(fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if(!fs.existsSync(file)){ res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.on('error', err => {
  if(err?.code === 'EADDRINUSE'){
    console.error(`Port ${PORT} is already in use.`);
    console.error(`If you already started the preview, open http://localhost:${PORT}`);
    console.error(`Otherwise stop the other process or run with a different port, for example: PORT=${PORT + 1} npm start`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Local preview: http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
