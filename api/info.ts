/**
 * Merged MY8 info function (keeps the project under the Hobby function limit).
 * Also Wallet Gear: /api/gear/:path* -> /api/info?fn=gear&route=:path*.
 * vercel.json rewrites /api/quote -> /api/info?fn=quote and /api/status -> /api/info?fn=status (query preserved).
 */
import quote from './_lib/quoteHandler.js'
import status from './_lib/statusHandler.js'
import gear from './_gear/gear.js'
import type { Req, Res } from './_lib/server.js'

export default function info(req: Req, res: Res) {
  if (req.query.fn === 'gear') return gear(req, res)
  return (req.query.fn === 'status' ? status : quote)(req, res)
}
