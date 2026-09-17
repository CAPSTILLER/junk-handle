import { TEST_MODE_BANNER } from '../config/contracts'
import { ownedNftCard } from '../services/mockNft'

export function OwnershipCard() {
  return (
    <section className="panel ownership">
      <div className="test-banner">{TEST_MODE_BANNER}</div>
      <h2>Owned NFT</h2>
      <div className="nft-card">
        <div className="nft-title">{ownedNftCard.name}</div>
        <dl>
          <div>
            <dt>Token</dt>
            <dd>#{ownedNftCard.tokenId}</dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd className="mono">{ownedNftCard.contract}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{ownedNftCard.status}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd className="mono">{ownedNftCard.owner}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
