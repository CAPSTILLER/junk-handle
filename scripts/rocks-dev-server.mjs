// Local dev/test server that mimics Vercel for My Wally: serves dist/ with the vercel.json rewrites and runs
// api/*.ts handlers through tsx. Usage: npx tsx scripts/rocks-dev-server.mjs  (PORT=4321, env from the shell)
import http from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const cfg = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm' }
function rewrite(p) {
  for (const r of cfg.rewrites) {
    const names = []
    const re = new RegExp('^' + r.source.replace(/:(\w+)\*/g, (_, n) => { names.push(n); return '(.*)' }).replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)' }) + '$')
    const m = p.match(re)
    if (m) { let d = r.destination; names.forEach((n, i) => { d = d.replace(':' + n + '*', m[i + 1]).replace(':' + n, m[i + 1]) }); return d }
  }
  return null
}
const mods = {}
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x')
  let p = u.pathname === '/' ? '/home.html' : u.pathname
  const file = path.join(root, 'dist', p)
  if (!(existsSync(file) && statSync(file).isFile()) && !p.startsWith('/api/')) {
    const d = rewrite(p); if (d) { const du = new URL(d, 'http://x'); p = du.pathname; du.searchParams.forEach((v, k) => u.searchParams.set(k, v)) }
  } else if (p.startsWith('/api/')) {
    const d = rewrite(p); if (d) { const du = new URL(d, 'http://x'); p = du.pathname; du.searchParams.forEach((v, k) => u.searchParams.set(k, v)) }
  }
  if (p.startsWith('/__mockipfs/') && globalThis.__pins) { const t = globalThis.__pins.get(p.split('/')[2]); res.statusCode = t ? 200 : 404; res.setHeader('Access-Control-Allow-Origin', '*'); res.end(t ?? 'nf'); return }
  if (p.startsWith('/api/')) {
    const f = path.join(root, p + '.ts')
    const mod = mods[f] ??= await import(f)
    const chunks = []; for await (const c of req) chunks.push(c)
    const raw = Buffer.concat(chunks).toString('utf8')
    let body = raw; try { body = raw ? JSON.parse(raw) : undefined } catch { /* string */ }
    const q = Object.fromEntries(u.searchParams)
    const vreq = Object.assign(req, { query: q, body })
    const vres = Object.assign(res, {
      status(c) { res.statusCode = c; return vres },
      json(b) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)); return vres },
      send(b) { res.end(b); return vres },
    })
    try { await mod.default(vreq, vres) } catch (e) { console.error(e); res.statusCode = 500; res.end('error') }
    return
  }
  const fp = path.join(root, 'dist', p)
  if (existsSync(fp) && statSync(fp).isFile()) { res.setHeader('Content-Type', types[path.extname(fp)] ?? 'application/octet-stream'); res.end(readFileSync(fp)); return }
  res.statusCode = 404; res.end('not found')
}).listen(Number(process.env.PORT || 4321), '127.0.0.1', () => console.log('dev server on', process.env.PORT || 4321))
