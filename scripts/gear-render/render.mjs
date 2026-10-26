// Wallet Gear renderer (GitHub Action or any box with Chromium + ffmpeg).
//   node scripts/gear-render/render.mjs                 -> render every pending token from the API, upload via OIDC
//   node scripts/gear-render/render.mjs --local <addr> <outdir>   -> just write <addr>.mp4/.png/.glb (no upload)
// Serves the repo root on :PORT itself (needs node_modules/three). 6 s, 30 fps, 1080², H.264 yuv420p faststart.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
// One configurable base: GEAR_SITE (default myassets). If it doesn't answer, fall back to the legacy domain (same deploy).
const SITES = [...new Set([process.env.GEAR_SITE, 'https://myassets.gearup.wtf', 'https://mywally.gearup.wtf'].filter(Boolean))]
let API = ''
async function pickApi() {
  for (const s of SITES) {
    try { const r = await fetch(s.replace(/\/$/, '') + '/api/gear/pending', { signal: AbortSignal.timeout(10000) }); if (r.ok) { API = s.replace(/\/$/, '') + '/api/gear'; return await r.json() } } catch { /* try next */ }
  }
  throw new Error('No gear API reachable: ' + SITES.join(', '))
}
const PORT = 18943, SECS = 6, FPS = 30, SIZE = 1080, N = SECS * FPS
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' }
const server = http.createServer((q, s) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname))
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end() }
  s.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s)
}).listen(PORT, '127.0.0.1')

async function render(browser, addr, outBase) {
  const t0 = Date.now()
  const p = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
  p.on('pageerror', (e) => console.error('pageerror', e.message))
  await p.goto(`http://127.0.0.1:${PORT}/scripts/gear-render/spin.html?addr=${addr}&size=${SIZE}`)
  await p.waitForFunction('window.ready', null, { timeout: 120000 })
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-maxrate', '3.2M', '-bufsize', '6M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-tag:v', 'avc1', outBase + '.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] })
  for (let i = 0; i < N; i++) {
    const d = await p.evaluate(`window.frame(${i / N})`)
    const buf = Buffer.from(d.split(',')[1], 'base64')
    if (i === Math.round(N * 0.08)) fs.writeFileSync(outBase + '.png', buf)
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
  }
  ff.stdin.end(); const code = await new Promise((r) => ff.on('close', r))
  if (code !== 0) throw new Error('ffmpeg failed ' + code)
  fs.writeFileSync(outBase + '.glb', Buffer.from(await p.evaluate('window.glb()'), 'base64'))
  await p.close()
  return (Date.now() - t0) / 1000
}

async function oidc() {
  const u = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, k = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!u || !k) throw new Error('No GitHub OIDC (needs permissions: id-token: write)')
  const r = await fetch(u + '&audience=mywally-gear-render', { headers: { Authorization: 'Bearer ' + k } })
  return (await r.json()).value
}
async function upload(addr, kind, file) {
  const res = await fetch(API + '/ingest', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (await oidc()) }, body: JSON.stringify({ address: addr, kind, data: fs.readFileSync(file).toString('base64') }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${kind} upload ${res.status} ${j.error || ''}`)
  return j
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let fail = 0
try {
  if (process.argv[2] === '--local') {
    const [, , , addr, out] = process.argv; fs.mkdirSync(out, { recursive: true })
    const s = await render(browser, addr.toLowerCase(), path.join(out, addr.toLowerCase()))
    console.log(JSON.stringify({ addr, seconds: s }))
  } else {
    const { pending = [] } = await pickApi()
    console.log('api', API, 'pending', pending.length)
    const tmp = fs.mkdtempSync('/tmp/gear-')
    for (const addr of pending.slice(0, 20)) {
      try {
        const s = await render(browser, addr, path.join(tmp, addr))
        for (const k of ['glb', 'png', 'mp4']) await upload(addr, k, path.join(tmp, `${addr}.${k}`))
        console.log('done', addr, s + 's')
      } catch (e) { fail++; console.error('FAILED', addr, e.message) }
    }
  }
} finally { await browser.close(); server.close() }
process.exit(fail ? 1 : 0)
