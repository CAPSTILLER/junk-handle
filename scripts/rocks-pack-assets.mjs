// Builds api/_rocks/assets.enc (encrypted) from Cap's local source files. Run on the box only:
//   ROCKS_ASSET_KEY=<base64 32 bytes> node scripts/rocks-pack-assets.mjs
// Inputs (never committed): avatar-foundry torso_lo.glb and the Meshy capstiller2 clip GLBs.
// Clip GLBs are stripped to skin + animation (Cap's mesh/textures are not copied).
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { createCipheriv, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TORSO = process.env.TORSO_GLB || '/workspace/avatar-foundry/assets/torso/torso_lo.glb';
const SRC = process.env.CAP_MODEL_DIR || '/workspace/capmodel/Meshy_AI_capstiller2_4_biped';
const CLIPS = ['Walking', 'Running', 'Big_Wave_Hello', 'Bass_Beats', 'Flirty_Strut_inplace', 'Cheer_with_Both_Hands'];
const kv = (process.env.ROCKS_ASSET_KEY || '').trim();
const key = /^(0x)?[0-9a-fA-F]{64}$/.test(kv) ? Buffer.from(kv.replace(/^0x/, ''), 'hex') : Buffer.from(kv, 'base64');
if (key.length !== 32) throw new Error('set ROCKS_ASSET_KEY (base64, 32 bytes)');

const io = new NodeIO();
const out = { torso: readFileSync(TORSO).toString('base64') };
for (const c of CLIPS) {
  const doc = await io.read(path.join(SRC, `Meshy_AI_capstiller2_4_biped_Animation_${c}_withSkin.glb`));
  const root = doc.getRoot();
  for (const n of root.listNodes()) if (n.getMesh()) n.setMesh(null);
  for (const m of root.listMeshes()) m.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  await doc.transform(prune({ propertyTypes: ['Accessor', 'Buffer'] }));
  if (!root.listSkins()[0] || !root.listAnimations()[0]) throw new Error('strip lost skin/animation: ' + c);
  const bin = await io.writeBinary(doc);
  out['clip:' + c] = Buffer.from(bin).toString('base64');
  console.log(c, (bin.length / 1024).toFixed(0) + ' KB');
}
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(out)))), cipher.final()]);
const file = path.join(path.dirname(new URL(import.meta.url).pathname), '../api/_rocks/assets.enc');
writeFileSync(file, Buffer.concat([iv, cipher.getAuthTag(), ct]));
console.log('wrote', file, ((ct.length + 28) / 1024).toFixed(0) + ' KB');
