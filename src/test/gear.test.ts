import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, createSign } from 'node:crypto'
import { gearMetadata, checkFile, verifyActionsToken, OIDC, PLACEHOLDER } from '../../api/_gear/gear'
import { glbMessage, tokenIdOf, addrOfToken } from '../../shared/gear/config'

const A = '0x604b2e24df58ef019312b8367af763a7f156bf08'
describe('wallet gear', () => {
  it('token id round trip', () => { expect(addrOfToken(tokenIdOf(A))).toBe(A) })
  it('metadata placeholder then ipfs', () => {
    const m = gearMetadata(A, tokenIdOf(A), null)
    expect(m.image).toBe(PLACEHOLDER); expect(m.attributes.find((x: any) => x.trait_type === 'Teeth')).toBeTruthy()
    const r = gearMetadata(A, tokenIdOf(A), { image: 'ipfs://a', animation: 'ipfs://b' } as any)
    expect(r.image).toBe('ipfs://a'); expect(r.animation_url).toBe('ipfs://b')
  })
  it('checkFile', () => {
    expect(() => checkFile('png', Buffer.alloc(5000))).toThrow()
    const p = Buffer.alloc(5000); p.set([0x89, 0x50, 0x4e, 0x47]); expect(() => checkFile('png', p)).not.toThrow()
  })
  it('glb message', () => { expect(glbMessage({ domain: 'x', address: A, tokenId: '1', expires: 0 } as any)).toContain('Wallet Gear GLB download') })
  it('oidc verify', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const jwk = { ...(publicKey.export({ format: 'jwk' }) as any), kid: 'k1', alg: 'RS256' }
    const mk = (claims: any) => {
      const b = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url')
      const h = b({ alg: 'RS256', kid: 'k1', typ: 'JWT' }) + '.' + b(claims)
      return h + '.' + createSign('RSA-SHA256').update(h).sign(privateKey).toString('base64url')
    }
    const now = Math.floor(Date.now() / 1000)
    const ok = { iss: OIDC.iss, aud: OIDC.aud, repository: OIDC.repo, ref: OIDC.ref, exp: now + 300, iat: now }
    await expect(verifyActionsToken('Bearer ' + mk(ok), [jwk])).resolves.toBeTruthy()
    await expect(verifyActionsToken('Bearer ' + mk({ ...ok, repository: 'evil/x' }), [jwk])).rejects.toThrow()
    await expect(verifyActionsToken('Bearer ' + mk({ ...ok, exp: now - 10 }), [jwk])).rejects.toThrow()
  })
})
import { siteFor } from '../../api/_gear/gear'
describe('domains', () => {
  it('gear links follow request host', () => {
    expect(siteFor('mywally.gearup.wtf')).toBe('https://mywally.gearup.wtf')
    expect(siteFor('myassets.gearup.wtf')).toBe('https://myassets.gearup.wtf')
    expect(siteFor('evil.com')).toBe('https://myassets.gearup.wtf')
  })
})
