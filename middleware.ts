// Vercel Routing Middleware: per-asset subdomains open their own page at "/".
// Static index.html wins over vercel.json rewrites at "/", so host routing lives here.
export const config = { matcher: '/' }

const HOST_PAGES: Record<string, string> = {
  'mywally.gearup.wtf': '/wally.html',
  'rocks.gearup.wtf': '/rocks.html',
}

export default function middleware(req: Request): Response | undefined {
  const url = new URL(req.url)
  const page = HOST_PAGES[url.hostname.toLowerCase()]
  if (!page) return undefined
  return new Response(null, { headers: { 'x-middleware-rewrite': new URL(page, url).toString() } })
}
