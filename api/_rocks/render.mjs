// CAPs Rocks renderer (server only). Turns (seed, active face, active pose) into files:
//   full  : rigged GLB, textures + 7 clips, active pose baked into the node rest transforms (owner only)
//   stl   : static mesh in the active pose, for 3D printing (owner only)
//   preview: decimated, untextured, unrigged clay GLB for anyone (clearly not the full asset)
import { Document } from '@gltf-transform/core';
import { weld, simplify, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three-foundry';
import { generate, makeIO } from './foundry/gen.mjs';

export const RIG_ID = 'caps-rock-tablet';
export const RIG_VERSION = 1;
export const PREVIEW_RATIO = 0.12;

/** Face hook. The face generator and CAPs mind face maker are not built yet: rocks show the blank tablet. */
// eslint-disable-next-line no-unused-vars
function applyFace(_result, _face) {
  // TODO(face-generator): engrave result.engraveZone with the active face (wallet face or custom face file).
  return false;
}

function restLocal(skel, name) {
  const l = skel.local[name];
  return { t: new THREE.Vector3().fromArray(l.t), r: new THREE.Quaternion().fromArray(l.r) };
}

/** Local rotation for a bone: rest ⊗ pose delta (pose JSON quaternions are relative to the rest pose). */
function posedLocalRotation(skel, name, pose) {
  const r = restLocal(skel, name).r;
  const q = pose?.bones?.[name];
  return q ? r.clone().multiply(new THREE.Quaternion(q[0], q[1], q[2], q[3]).normalize()) : r;
}

/** World matrix per joint in the given pose. */
function jointWorlds(skel, pose) {
  const world = {};
  const get = (n) => {
    if (world[n]) return world[n];
    const { t } = restLocal(skel, n);
    if (n === 'mixamorig:Hips' && pose?.rootOffset) t.add(new THREE.Vector3().fromArray(pose.rootOffset));
    const m = new THREE.Matrix4().compose(t, posedLocalRotation(skel, n, pose), new THREE.Vector3(1, 1, 1));
    world[n] = skel.parent[n] ? get(skel.parent[n]).clone().multiply(m) : m;
    return world[n];
  };
  skel.names.forEach(get);
  return world;
}

/** Posed, unskinned triangle soup for every bucket (rigid skinning: 1 joint per vertex). */
function posedBuckets(r, pose) {
  const W = jointWorlds(r.skel, pose);
  const skinM = r.skel.names.map((n, i) => W[n].clone().multiply(new THREE.Matrix4().fromArray(r.skel.ibm.slice(i * 16, i * 16 + 16))));
  const out = [];
  for (const [k, b] of Object.entries(r.buckets)) {
    if (!b.pos.length) continue;
    const pos = new Float32Array(b.pos.length), v = new THREE.Vector3();
    for (let i = 0; i < b.jnt.length; i++) {
      v.set(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]).applyMatrix4(skinM[b.jnt[i]]);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    out.push({ k, pos });
  }
  return out;
}

export async function renderRock(seed, { pose = null, face = null, kind = 'full' } = {}) {
  const r = await generate(seed, { style: 'tablet' });
  applyFace(r, face);
  if (kind === 'full') {
    if (pose) for (const n of r.skel.names) r.nodes[n].setRotation(posedLocalRotation(r.skel, n, pose).toArray());
    if (pose?.rootOffset) {
      const t = restLocal(r.skel, 'mixamorig:Hips').t.add(new THREE.Vector3().fromArray(pose.rootOffset));
      r.nodes['mixamorig:Hips'].setTranslation(t.toArray());
    }
    r.doc.getRoot().listNodes()[0]?.setExtras({ ...(r.doc.getRoot().listNodes()[0].getExtras() || {}), capsRocks: { pose: pose ? pose.name ?? 'custom' : 'rest', face: face ? 'set' : 'blank' } });
    return { bytes: Buffer.from(await makeIO().writeBinary(r.doc)), contentType: 'model/gltf-binary', ext: 'glb', traits: r.traits, short: r.short };
  }
  const parts = posedBuckets(r, pose);
  if (kind === 'stl') {
    const tris = parts.reduce((s, p) => s + p.pos.length / 9, 0);
    const stl = Buffer.alloc(84 + tris * 50);
    stl.write('CAPs Rocks ' + r.T.address, 0);
    stl.writeUInt32LE(tris, 80);
    let o = 84;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    for (const { pos } of parts) for (let i = 0; i < pos.length; i += 9) {
      a.fromArray(pos, i); b.fromArray(pos, i + 3); c.fromArray(pos, i + 6);
      n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
      for (const v of [n, a, b, c]) { stl.writeFloatLE(v.x, o); stl.writeFloatLE(v.y, o + 4); stl.writeFloatLE(v.z, o + 8); o += 12; }
      o += 2;
    }
    return { bytes: stl, contentType: 'model/stl', ext: 'stl', traits: r.traits, short: r.short };
  }
  // preview: one flat clay material, no textures, no UVs, no rig, no clips, heavily decimated
  const doc = new Document();
  doc.createBuffer();
  const mat = doc.createMaterial('PreviewClay').setBaseColorFactor([0.42, 0.47, 0.58, 1]).setMetallicFactor(0).setRoughnessFactor(1);
  const mesh = doc.createMesh('RockPreview');
  const all = new Float32Array(parts.reduce((s, p) => s + p.pos.length, 0));
  let off = 0;
  for (const p of parts) { all.set(p.pos, off); off += p.pos.length; }
  mesh.addPrimitive(doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', doc.createAccessor('pos').setType('VEC3').setArray(all)));
  const scene = doc.createScene('Preview');
  scene.addChild(doc.createNode('CAPsRockPreview').setMesh(mesh).setExtras({ preview: true, note: 'Low-poly preview. The full model is only available to the holder.' }));
  doc.getRoot().getAsset().generator = 'CAPs Rocks preview (decimated, untextured)';
  await MeshoptSimplifier.ready;
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: PREVIEW_RATIO, error: 0.02, lockBorder: false }), dedup(), prune());
  // positions only; three.js computes flat normals client-side
  return { bytes: Buffer.from(await makeIO().writeBinary(doc)), contentType: 'model/gltf-binary', ext: 'glb', traits: r.traits, short: r.short };
}

export async function rockTraits(seed) {
  const r = await generate(seed, { style: 'tablet' });
  return { traits: r.traits, engraveZone: r.engraveZone, short: r.short };
}
