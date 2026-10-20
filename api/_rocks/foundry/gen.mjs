#!/usr/bin/env node
// Avatar Foundry prototype: node gen.js <address> [--all-clips] -> out/<short>.{glb,obj,stl,json}
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';
import { weld } from '@gltf-transform/functions';
import * as THREE from 'three-foundry';
import { packGlb } from '../assets.mjs';
import { deriveTraits } from './traits.mjs';
import { buildBody } from './body.mjs';
import { deriveTabletTraits } from './tablet/traits.mjs';
import { buildTabletBody } from './tablet/body.mjs';
import { bakeStoneTexture } from './tablet/texture.mjs';
import { subRng } from './rng.mjs';
import { loadSkeleton, loadClip, clipDuration, sampleChannel } from './skeleton.mjs';

const TORSO_TINT = process.env.TORSO_TINT || '#ffffff';
const CORE_CLIPS = ['Walking', 'Running', 'Big_Wave_Hello', 'Bass_Beats', 'Flirty_Strut_inplace', 'Cheer_with_Both_Hands'];
const EXTRA_CLIPS = ['Carry_Heavy_Cannon_Forward', 'Climb_Attempt_and_Fall_5', 'Crawl_and_Look_Back', 'Crouch_Pull_and_Throw', 'Dive_Down_and_Land_1', 'Fall1', 'climbing_up_wall', 'dying_backwards'];
const RECENTER = new Set(['Big_Wave_Hello', 'Bass_Beats', 'Cheer_with_Both_Hands', 'Flirty_Strut_inplace']); // keep in place
const IDLE_SOURCE = { clip: process.env.IDLE_CLIP || 'Walking', t: +(process.env.IDLE_T || 0.26) };

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

function deriveIdle(src, skel) {
  // hold one calm pose from the source clip, then add a 4 s breathing / sway loop
  const fps = 15, dur = 4, N = dur * fps + 1, out = [];
  const sway = { 'mixamorig:Spine1': [0.025, 0], 'mixamorig:Spine2': [0.02, 0], 'mixamorig:Neck': [-0.02, 0.03], 'mixamorig:Head': [-0.015, 0.05], 'mixamorig:LeftArm': [0, 0.035], 'mixamorig:RightArm': [0, -0.035] };
  for (const ch of src) {
    const base = sampleChannel(ch, IDLE_SOURCE.t), times = new Float32Array(N), n = ch.path === 'rotation' ? 4 : 3, vals = new Float32Array(N * n);
    for (let i = 0; i < N; i++) {
      const t = i / fps, ph = (t / dur) * Math.PI * 2; times[i] = t;
      let v = base;
      if (ch.path === 'rotation' && sway[ch.node]) {
        const [ax, ay] = sway[ch.node];
        const q = new THREE.Quaternion().fromArray(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(ax * Math.sin(ph * 2), ay * Math.sin(ph), ay * 0.5 * Math.sin(ph * 2))));
        v = q.toArray();
      } else if (ch.path === 'translation' && ch.node === 'mixamorig:Hips') {
        const b = skel.local['mixamorig:Hips'].t;
        v = [b[0], base[1] + 0.006 * Math.sin(ph * 2) - 0.004, b[2]];
      }
      vals.set(v.slice(0, n), i * n);
    }
    out.push({ ...ch, times, values: vals });
  }
  return out;
}

export const STYLES = { tablet: 'Crushed Prophecy', gear: 'Gear Knight' };

let torsoCache = null;
// per-vertex tangents (Lengyel), orthogonalised against the normal; degenerate UVs fall back to any perpendicular
function vertexTangents(P, N, UV, I) {
  const n = P.length / 3, T = new Float32Array(n * 3), B = new Float32Array(n * 3), out = new Float32Array(n * 4);
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
    const e1 = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), e2 = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k]);
    const du1 = UV[b * 2] - UV[a * 2], dv1 = UV[b * 2 + 1] - UV[a * 2 + 1], du2 = UV[c * 2] - UV[a * 2], dv2 = UV[c * 2 + 1] - UV[a * 2 + 1];
    const d = du1 * dv2 - du2 * dv1; if (Math.abs(d) < 1e-12) continue; const r = 1 / d;
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) { T[v * 3 + k] += (e1[k] * dv2 - e2[k] * dv1) * r; B[v * 3 + k] += (e2[k] * du1 - e1[k] * du2) * r; }
  }
  for (let v = 0; v < n; v++) {
    const nn = new THREE.Vector3(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]).normalize();
    let t = new THREE.Vector3(T[v * 3], T[v * 3 + 1], T[v * 3 + 2]); t.sub(nn.clone().multiplyScalar(nn.dot(t)));
    if (t.lengthSq() < 1e-20) { t = Math.abs(nn.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0); t.sub(nn.clone().multiplyScalar(nn.dot(t))); }
    t.normalize();
    const w = nn.clone().cross(t).dot(new THREE.Vector3(B[v * 3], B[v * 3 + 1], B[v * 3 + 2])) < 0 ? -1 : 1;
    out.set([t.x, t.y, t.z, w], v * 4);
  }
  return out;
}
async function loadTorsoAsset() { // decimated Meshy torso (see torso_prep.mjs)
  if (torsoCache) return torsoCache;
  const d = await new NodeIO().readBinary(await packGlb('torso')), p = d.getRoot().listMeshes()[0].listPrimitives()[0], m = p.getMaterial();
  torsoCache = {
    pos: p.getAttribute('POSITION').getArray(), nrm: p.getAttribute('NORMAL').getArray(), uv: p.getAttribute('TEXCOORD_0').getArray(), idx: p.getIndices().getArray(),
    tan: vertexTangents(p.getAttribute('POSITION').getArray(), p.getAttribute('NORMAL').getArray(), p.getAttribute('TEXCOORD_0').getArray(), p.getIndices().getArray()),
    images: { base: m.getBaseColorTexture().getImage(), normal: m.getNormalTexture().getImage(), mr: m.getMetallicRoughnessTexture().getImage() },
  };
  return torsoCache;
}

export async function generate(address, { style = 'tablet', allClips = false, torsoMode = 'meshy' } = {}) {
  if (!STYLES[style]) throw new Error('unknown style ' + style + ' (use: ' + Object.keys(STYLES).join(', ') + ')');
  const tablet = style === 'tablet';
  const T = tablet ? deriveTabletTraits(address) : deriveTraits(address);
  const skel = await loadSkeleton();
  const torsoAsset = tablet && torsoMode === 'meshy' ? await loadTorsoAsset() : null;
  const { buckets, engraveZone, stats } = tablet ? buildTabletBody(T, skel, torsoAsset) : buildBody(T, skel);
  const short = T.address.slice(0, 6) + '-' + T.address.slice(-4);

  const doc = new Document();
  doc.createBuffer();
  const es = doc.createExtension(KHRMaterialsEmissiveStrength);
  doc.getRoot().getAsset().generator = tablet ? 'Cap\'s Mind Avatar Foundry v0.2 (tablet)' : 'Cap\'s Mind Avatar Foundry v0.1';
  const scene = doc.createScene('AvatarScene');
  const root = doc.createNode('Avatar_' + short).setExtras(tablet ? { address: T.address, seed: T.seed, style } : { address: T.address, seed: T.seed });
  scene.addChild(root);

  // skeleton: identical names / hierarchy / inverse bind matrices to Cap's Meshy rig
  const nodes = {};
  for (const n of skel.names) { const l = skel.local[n]; nodes[n] = doc.createNode(n).setTranslation(l.t).setRotation(l.r).setScale(l.s); }
  for (const n of skel.names) (skel.parent[n] ? nodes[skel.parent[n]] : root).addChild(nodes[n]);
  const skin = doc.createSkin('AvatarSkin').setSkeleton(nodes['mixamorig:Hips'])
    .setInverseBindMatrices(doc.createAccessor('IBM').setType('MAT4').setArray(new Float32Array(skel.ibm)));
  skel.names.forEach((n) => skin.addJoint(nodes[n]));

  // materials
  const fin = T.finish || {}, g = T.glow.hex;
  const mk = (name, color, metal, rough, emissive, strength = 1) => {
    const m = doc.createMaterial(name).setBaseColorFactor([...hex(color), 1]).setMetallicFactor(metal).setRoughnessFactor(rough);
    if (emissive) { m.setEmissiveFactor(hex(emissive)); if (strength !== 1) m.setExtension('KHR_materials_emissive_strength', es.createEmissiveStrength().setEmissiveStrength(strength)); }
    return m;
  };
  let texJpg = null;
  const mats = tablet ? (() => {
    texJpg = bakeStoneTexture(subRng(T.seed, 'veins'), { veins: T.veins });
    const tex = doc.createTexture('TabletStone').setImage(texJpg).setMimeType('image/jpeg').setURI('tablet_stone.jpg');
    const stone = (name) => { const m = doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(0.82); return m; };
    return {
      stone: stone('TabletStone'),
      inlay: mk('Inlay', '#F2EFE6', 0.05, 0.4),
      glow: mk('AuraGlow', g, 0, 0.5, g, T.aura.strength).setBaseColorFactor([...hex(g), 1]),
      face: stone('FaceTablet'),
      ...(torsoAsset ? { torso: (() => {
        const t = (name, img) => doc.createTexture(name).setImage(img).setMimeType('image/jpeg').setURI(name + '.jpg');
        return doc.createMaterial('ShatteredTorso').setBaseColorFactor([...hex(TORSO_TINT), 1]).setMetallicFactor(1).setRoughnessFactor(1)
          .setBaseColorTexture(t('torso_base', torsoAsset.images.base)).setNormalTexture(t('torso_normal', torsoAsset.images.normal))
          .setMetallicRoughnessTexture(t('torso_mr', torsoAsset.images.mr));
      })() } : {}),
    };
  })() : {
    body: mk('Body', T.palette.primary, fin.metallic, fin.roughness),
    trim: mk('Trim', T.palette.secondary, Math.min(1, fin.metallic + 0.25), Math.max(0.25, fin.roughness - 0.15)),
    inlay: mk('Inlay', '#F2EFE6', 0.05, 0.35),
    glow: mk('Glow', g, 0, 0.4, g, 4).setBaseColorFactor([...hex(g), 1]),
    face: mk('FacePlate', '#E9E5DA', 0.0, 0.6),
  };
  const mesh = doc.createMesh('AvatarMesh');
  const allPos = [];
  for (const [k, b] of Object.entries(buckets)) {
    if (!b.pos.length) continue;
    const cnt = b.jnt.length, jn = new Uint8Array(cnt * 4), wt = tablet ? new Uint8Array(cnt * 4) : new Float32Array(cnt * 4);
    b.jnt.forEach((j, i) => { jn[i * 4] = j; wt[i * 4] = tablet ? 255 : 1; }); // tablet: normalized ubyte weights (smaller)
    const nrm = new Float32Array(b.nrm);
    for (let i = 0; i < cnt; i++) { const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1; nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l; }
    const prim = doc.createPrimitive().setMaterial(mats[k])
      .setAttribute('POSITION', doc.createAccessor(k + '_pos').setType('VEC3').setArray(new Float32Array(b.pos)))
      .setAttribute('NORMAL', doc.createAccessor(k + '_nrm').setType('VEC3').setArray(nrm))
      .setAttribute('JOINTS_0', doc.createAccessor(k + '_jnt').setType('VEC4').setArray(jn))
      .setAttribute('WEIGHTS_0', doc.createAccessor(k + '_wgt').setType('VEC4').setArray(wt).setNormalized(tablet));
    if (b.uv && mats[k].getBaseColorTexture()) prim.setAttribute('TEXCOORD_0', doc.createAccessor(k + '_uv').setType('VEC2').setArray(new Float32Array(b.uv)));
    if (b.tan && b.tan.length) prim.setAttribute('TANGENT', doc.createAccessor(k + '_tan').setType('VEC4').setArray(new Float32Array(b.tan)));
    if (b.col && k !== 'torso') prim.setAttribute('COLOR_0', doc.createAccessor(k + '_col').setType('VEC3').setArray(new Float32Array(b.col)));
    mesh.addPrimitive(prim);
    allPos.push({ k, pos: b.pos, uv: b.uv });
  }
  const meshNode = doc.createNode('AvatarBody').setMesh(mesh).setSkin(skin);
  scene.addChild(meshNode); // skinned mesh node at scene root (validator best practice)

  // animations
  const clipNames = allClips ? [...CORE_CLIPS, ...EXTRA_CLIPS] : CORE_CLIPS;
  const clips = [];
  const addClip = (name, chs) => {
    const a = doc.createAnimation(name), inputs = new Map();
    for (const ch of chs) {
      if (!nodes[ch.node]) continue;
      if (!inputs.has(ch.times)) inputs.set(ch.times, doc.createAccessor().setType('SCALAR').setArray(ch.times));
      const s = doc.createAnimationSampler().setInput(inputs.get(ch.times)).setInterpolation('LINEAR')
        .setOutput(doc.createAccessor().setType(ch.path === 'rotation' ? 'VEC4' : 'VEC3').setArray(ch.values));
      a.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodes[ch.node]).setTargetPath(ch.path).setSampler(s));
    }
    clips.push({ name, duration: +clipDuration(chs).toFixed(3), channels: a.listChannels().length });
  };
  addClip('Idle', deriveIdle(await loadClip(IDLE_SOURCE.clip), skel));
  for (const c of clipNames) {
    let chs = await loadClip(c);
    if (RECENTER.has(c)) {
      const b = skel.local['mixamorig:Hips'].t;
      chs = chs.map((ch) => {
        if (ch.node !== 'mixamorig:Hips' || ch.path !== 'translation') return ch;
        const v = Float32Array.from(ch.values), dx = v[0] - b[0], dz = v[2] - b[2];
        for (let i = 0; i < v.length; i += 3) { v[i] -= dx; v[i + 2] -= dz; }
        return { ...ch, values: v };
      });
    }
    addClip(c, chs);
  }

  await doc.transform(weld());
  const traits = tablet ? {
    Style: 'Crushed Prophecy', 'Fracture Facets': T.fracture.sides + '-' + (T.fracture.sides + 2), Jaggedness: T.fracture.jag, 'Chipped Corners': T.fracture.chips,
    'Slab Thickness': T.fracture.thickness, Build: T.build.name, 'Shards Per Limb': T.shardsPerLimb, Layering: T.layering,
    Spacing: T.fill < 0.98 ? 'Cracked' : T.fill > 1.06 ? 'Packed' : 'Fitted', Scatter: T.scatter, Tilt: T.tilt,
    Veins: T.veins, 'Inscribed Shards': stats.inscribed, 'Tint Spread': T.tintSpread, Glow: T.glow.name,
    Aura: T.aura.name, Head: T.head, Shoulders: T.shoulders, Chest: T.chest, Torso: T.torso,
  } : {};
  return { doc, short, T, skel, nodes, buckets, mats, allPos, engraveZone, stats, clips, traits, texBytes: texJpg ? texJpg.length : 0 };
}

export const makeIO = () => new NodeIO().registerExtensions([KHRMaterialsEmissiveStrength]);
