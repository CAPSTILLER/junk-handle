import { LIVE_PLACEHOLDERS, onchainService } from '../services/onchainPlaceholder'

export function OnchainLater() {
  return (
    <details className="panel onchain-later">
      <summary>Enable live onchain later</summary>
      <p className="hint">
        Inactive placeholders only. This offline build never connects a wallet,
        reads chain state, or sends transactions. Service enabled:{' '}
        <strong>{String(onchainService.enabled)}</strong>
      </p>
      <dl className="placeholder-dl">
        <div>
          <dt>NFT contract</dt>
          <dd className="mono">{LIVE_PLACEHOLDERS.nftContract}</dd>
        </div>
        <div>
          <dt>FORLZ token</dt>
          <dd className="mono">{LIVE_PLACEHOLDERS.forlzContract}</dd>
        </div>
        <div>
          <dt>Token id</dt>
          <dd>#{LIVE_PLACEHOLDERS.tokenId}</dd>
        </div>
      </dl>
      <ul>
        {LIVE_PLACEHOLDERS.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </details>
  )
}
