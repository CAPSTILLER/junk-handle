// CAPs Rocks renderer (server only). Turns (seed, active face, active pose) into files:
//   full  : rigged GLB, textures + 7 clips, active pose baked into the node rest transforms (owner only)
//   stl   : static mesh in the active pose, for 3D printing (owner only)
//   preview: decimated, untextured, unrigged clay GLB for anyone (clearly not the full asset)
import { Document } from '@gltf-transform/core';
import { weld, simplify, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three-foundry';
import { generate, makeIO } from './foundry/gen.mjs';
import { faceTriangles } from '../../shared/faces/faceMesh.mjs';
import { FACE_GENERATOR } from '../../shared/faces/generator.mjs';

export const RIG_ID = 'caps-rock-tablet';
export const RIG_VERSION = 1;
export const PREVIEW_RATIO = 0.12;

/** Active wallet face (generator v1) -> flat white inlay mesh on the face tablet. Custom faces are not rendered yet. */
export const FACE_ZONE_NODE = 'CAPsRockFaceZone';
export const FACE_MESH = 'CAPsRockFace';
const HEAD = 'mixamorig:Head';
function faceMatrix(r, worldOfHead) {
  const z = r.engraveZone, i = r.skel.names.indexOf(HEAD);
  const ibm = new THREE.Matrix4().fromArray(r.skel.ibm.slice(i * 16, i * 16 + 16));
  const t = new THREE.Matrix4().makeTranslation(z.surface[0], z.surface[1], z.surface[2] + 0.0004);
  return (worldOfHead ? worldOfHead.clone().multiply(ibm) : ibm).multiply(t);
}
function wantFace(face) { return FACE_GENERATOR.ready && face && face.kind === 0 && Number(face.generatorVersion) === 1 ? face : null; }
/** Adds the face-zone node (always, so viewers can live-preview faces) and the face mesh when a wallet face is active. */
function addFace(doc, r, parent, matrix, face, material) {
  const z = r.engraveZone, f = wantFace(face);
  const node = doc.createNode(FACE_ZONE_NODE).setMatrix(matrix.toArray())
    .setExtras({ tabletW: z.tablet[0], tabletH: z.tablet[1], face: f ? { seed: f.seed, generatorVersion: 1, variant: Number(f.variant) } : null, generator: FACE_GENERATOR.id });
  parent.addChild(node);
  if (!f) return false;
  const pos = faceTriangles(f.seed, Number(f.variant), z.tablet[0]);
  const nrm = new Float32Array(pos.length); for (let i = 2; i < nrm.length; i += 3) nrm[i] = 1;
  const mesh = doc.createMesh(FACE_MESH).addPrimitive(doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', doc.createAccessor('face_pos').setType('VEC3').setArray(pos))
    .setAttribute('NORMAL', doc.createAccessor('face_nrm').setType('VEC3').setArray(nrm)));
  node.addChild(doc.createNode(FACE_MESH).setMesh(mesh));
  return true;
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

export async function renderRock(seed, { pose = null, face = null, kind = 'full', facePng = null } = {}) {
  const r = await generate(seed, { style: 'tablet' });
  if (kind === 'full') {
    if (pose) for (const n of r.skel.names) r.nodes[n].setRotation(posedLocalRotation(r.skel, n, pose).toArray());
    if (pose?.rootOffset) {
      const t = restLocal(r.skel, 'mixamorig:Hips').t.add(new THREE.Vector3().fromArray(pose.rootOffset));
      r.nodes['mixamorig:Hips'].setTranslation(t.toArray());
    }
    addFace(r.doc, r, r.nodes[HEAD], faceMatrix(r, null), face, r.mats.inlay);
    r.doc.getRoot().listNodes()[0]?.setExtras({ ...(r.doc.getRoot().listNodes()[0].getExtras() || {}), capsRocks: { pose: pose ? pose.name ?? 'custom' : 'rest', face: wantFace(face) ? `wallet v1 #${face.variant}` : 'blank' } });
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
  // face zone + active wallet face (added after decimation so the inlay lines stay crisp)
  const inlay = doc.createMaterial('FaceInlay').setBaseColorFactor([0.933, 0.949, 0.961, 1]).setMetallicFactor(0).setRoughnessFactor(0.45);
  addFace(doc, r, scene, faceMatrix(r, jointWorlds(r.skel, pose)[HEAD]), face, inlay);
  if (kind === 'display') {
    // public low-poly display: decimated, unrigged, blue marble via vertex colors + active face PNG on the tablet
    mat.setName('LowPolyMarble').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.6);
    for (const prim of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
      if (prim.getMaterial() !== mat) continue;
      const P = prim.getAttribute('POSITION'), n = P.getCount(), col = new Float32Array(n * 4), v = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        P.getElement(i, v);
        const w = Math.sin(v[0] * 23 + Math.sin(v[1] * 17) * 3 + v[2] * 11 + Math.sin(v[1] * 41 + v[0] * 7));
        const vein = Math.abs(w) < 0.09, t = 0.85 + 0.15 * Math.sin(v[1] * 9 + v[2] * 13);
        col.set(vein ? [0.85, 0.9, 1, 1] : [0.07 * t, 0.2 * t, 0.62 * t, 1], i * 4);
      }
      prim.setAttribute('COLOR_0', doc.createAccessor('marble').setType('VEC4').setArray(col));
    }
    const zone = doc.getRoot().listNodes().find((x) => x.getName() === FACE_ZONE_NODE);
    if (zone && facePng) {
      const [w, h] = r.engraveZone.tablet, x = w / 2, y = h / 2;
      const tex = doc.createTexture('face').setImage(new Uint8Array(facePng)).setMimeType('image/png');
      const fm = doc.createMaterial('FaceScreen').setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(0.5);
      const prim = doc.createPrimitive().setMaterial(fm)
        .setAttribute('POSITION', doc.createAccessor('fq_pos').setType('VEC3').setArray(new Float32Array([-x, -y, 0.0006, x, -y, 0.0006, x, y, 0.0006, -x, y, 0.0006])))
        .setAttribute('NORMAL', doc.createAccessor('fq_nrm').setType('VEC3').setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])))
        .setAttribute('TEXCOORD_0', doc.createAccessor('fq_uv').setType('VEC2').setArray(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])))
        .setIndices(doc.createAccessor('fq_i').setType('SCALAR').setArray(new Uint16Array([0, 1, 2, 0, 2, 3])));
      zone.addChild(doc.createNode('CAPsRockFaceScreen').setMesh(doc.createMesh('CAPsRockFaceScreen').addPrimitive(prim)));
    }
    doc.getRoot().getAsset().generator = 'CAPs Rocks low-poly display (official build)';
  }
  // positions only; three.js computes flat normals client-side
  return { bytes: Buffer.from(await makeIO().writeBinary(doc)), contentType: 'model/gltf-binary', ext: 'glb', traits: r.traits, short: r.short };
}

export async function rockTraits(seed) {
  const r = await generate(seed, { style: 'tablet' });
  return { traits: r.traits, engraveZone: r.engraveZone, short: r.short };
}
