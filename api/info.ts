/**
 * Merged MY8 info function (keeps the project under the Hobby function limit).
 * vercel.json rewrites /api/quote -> /api/info?fn=quote and /api/status -> /api/info?fn=status (query preserved).
 */
import quote from './_lib/quoteHandler.js'
import status from './_lib/statusHandler.js'
import type { Req, Res } from './_lib/server.js'

export default function info(req: Req, res: Res) {
  return (req.query.fn === 'status' ? status : quote)(req, res)
}
