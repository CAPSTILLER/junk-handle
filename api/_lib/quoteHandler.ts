import { getQuote } from './price.js'
import { handle } from './server.js'

/** GET /api/quote → live FRLZ amounts + USD values for mint and revision (cached ~45s). */
export default handle(['GET'], async () => getQuote())
