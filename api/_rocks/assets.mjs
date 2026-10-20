// CAPs Rocks private asset pack (server only).
// Cap's torso + the Meshy rig/clip data are NOT in this public repo in readable form: assets.enc is
// AES-256-GCM ciphertext. The key lives only in the Vercel env var ROCKS_ASSET_KEY (base64, 32 bytes).
// Layout: iv(12) | tag(16) | ciphertext(gzip(JSON { name: base64 GLB })).
import { createDecipheriv } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let pack = null;

/** ROCKS_ASSET_KEY: 32 bytes as hex (optionally 0x-prefixed) or base64. */
export function assetKeyBytes() {
  const v = (process.env.ROCKS_ASSET_KEY ?? '').trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v.replace(/^0x/, ''), 'hex');
  return Buffer.from(v, 'base64');
}

function packPath() {
  const candidates = [join(process.cwd(), 'api/_rocks/assets.enc')];
  try { candidates.push(join(dirname(fileURLToPath(import.meta.url)), 'assets.enc')); } catch { /* bundled */ }
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

export function assetKeyConfigured() {
  return assetKeyBytes().length === 32;
}

export function loadPack() {
  if (pack) return pack;
  const key = assetKeyBytes();
  if (key.length !== 32) throw Object.assign(new Error('ROCKS_ASSET_KEY is not set'), { code: 'asset_key_missing' });
  const buf = readFileSync(packPath());
  const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  const json = gunzipSync(Buffer.concat([d.update(buf.subarray(28)), d.final()])).toString('utf8');
  pack = JSON.parse(json);
  return pack;
}

export async function packGlb(name) {
  const b64 = loadPack()[name];
  if (!b64) throw new Error('asset pack has no ' + name);
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
