// Places copies of the base shape along the bind-pose skeleton. Every vertex is rigidly
// bound (weight 1.0) to exactly one joint.
import * as THREE from 'three-foundry';
import { makeShape, helpers } from './shapes.mjs';
import { subRng, range } from './rng.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const MATS = ['body', 'trim', 'inlay', 'glow', 'face'];

export function buildBody(T, skel) {
  const P = skel.pos, J = (n) => skel.names.indexOf(n);
  const buckets = Object.fromEntries(MATS.map((m) => [m, { pos: [], nrm: [], jnt: [] }]));
  const base = makeShape(T.shape.family, T.shape, subRng(T.seed, 'shape'));
  const B = T.build;
  const stats = { copies: 0 };

  function push(geo, matrix, joint, mat) {
    const g = geo.clone().applyMatrix4(matrix);
    g.computeVertexNormals();
    const b = buckets[mat], p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { b.pos.push(p[i]); b.nrm.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) b.jnt.push(joint);
  }
  function basis(dir, hint = V(0, 0, 1)) {
    const y = dir.clone().normalize();
    let h = hint.clone(); if (Math.abs(h.dot(y)) > 0.92) h = Math.abs(y.y) > 0.9 ? V(0, 0, 1) : V(0, 1, 0);
    const z = h.sub(y.clone().multiplyScalar(h.dot(y))).normalize();
    const x = y.clone().cross(z).normalize();
    return new THREE.Matrix4().makeBasis(x, y, z);
  }
  // one oriented copy: center c, long axis dir, dims (w = local x, l = along, d = local z)
  function put(geo, c, dir, w, l, d, joint, mat, { spin = 0, tx = 0, tz = 0, hint } = {}) {
    const m = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)
      .multiply(basis(dir, hint))
      .multiply(new THREE.Matrix4().makeRotationY(spin))
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tx, 0, tz)))
      .multiply(new THREE.Matrix4().makeScale(w, l, d));
    push(geo, m, J(joint), mat); stats.copies++;
  }
  // a run of k copies of the base shape between a and b
  function limb(label, side, a, b, joint, { w, d, k = T.copiesPerLimb, mat = () => 'body', hint, fill = T.fill, geo = base, veins = T.auraVeins }) {
    const r = subRng(T.seed, label), mir = side === 'R' ? -1 : 1;
    const dir = b.clone().sub(a), len = dir.length(), thin = geo === base && T.shape.family === 'Gear' ? 0.62 : 1;
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5) / k, c = a.clone().lerp(b, t), j = range(r, 0.9, 1.1);
      put(geo, c, dir, w * j, (len / k) * fill * thin * range(r, 0.92, 1.05), d * j, joint, mat(i, k), {
        spin: mir * (i * T.spinStep + range(r, -0.15, 0.15)), tx: range(r, -1, 1) * T.tilt, tz: mir * range(r, -1, 1) * T.tilt, hint,
      });
    }
    if (veins) put(helpers.rod(6), a.clone().lerp(b, 0.5), dir, Math.min(w, d) * 0.22, len * 0.98, Math.min(w, d) * 0.22, joint, 'glow', { hint });
  }
  const pat = T.pattern, gearFam = T.shape.family === 'Gear';
  const limbMat = (lower) => (i) => {
    if (pat === 'Alternating') return i % 2 ? 'trim' : 'body';
    if (pat === 'Gloves & Boots') return lower ? 'trim' : 'body';
    if (pat === 'Inverted') return 'body';
    return 'body';
  };
  const torsoMat = (i) => (pat === 'Inverted' ? 'trim' : pat === 'Alternating' && i % 2 ? 'trim' : 'body');

  // ---- torso: rows per spine segment, 1-3 columns
  const cols = T.shape.family === 'Gear' ? 1 : { Monolith: 1, Split: 2, Ribbed: 3 }[T.torso];
  const tw = B.torso, rT = subRng(T.seed, 'torso');
  const rows = [
    ['Hips', V(0, -0.12, 0), 'Spine', 0.34, 0.22],
    ['Spine', null, 'Spine1', 0.29, 0.19],
    ['Spine1', null, 'Spine2', 0.36, 0.22],
    ['Spine2', null, 'Neck', 0.44, 0.24],
  ];
  rows.forEach(([j0, off, j1, w, d], ri) => {
    const a = P['mixamorig:' + j0].clone().add(off || V()), b = P['mixamorig:' + j1].clone();
    if (j0 === 'Hips') { a.x = b.x = 0; }
    const ww = w * tw, len = b.clone().sub(a).length();
    for (let c = 0; c < cols; c++) {
      const cx = cols === 1 ? 0 : (c / (cols - 1) - 0.5) * ww * (cols === 2 ? 0.5 : 0.66);
      const cw = cols === 1 ? ww : ww / cols * (cols === 2 ? 1.0 : 1.12);
      const ctr = a.clone().lerp(b, 0.5).add(V(cx, 0, 0));
      const sub = 1;
      for (let q = 0; q < sub; q++) {
        const cc = sub === 1 ? ctr : a.clone().lerp(b, (q + 0.5) / sub).add(V(cx, 0, 0));
        put(base, cc, b.clone().sub(a), cw, (len / sub) * (gearFam ? 0.72 : Math.max(T.fill, 0.95) * 1.06), d * tw * (c === 1 && cols === 3 ? 1.08 : 1), 'mixamorig:' + j0, torsoMat(ri), {
          spin: (cols === 1 ? 0 : (c - (cols - 1) / 2)) * 0.12 + q * T.spinStep, tx: range(rT, -0.5, 0.5) * T.tilt * 0.5,
        });
      }
    }
  });
  // neck
  limb('neck', 'L', P['mixamorig:Neck'], P['mixamorig:Head'].clone().add(V(0, 0.03, 0)), 'mixamorig:Neck', { w: 0.1 * B.torso, d: 0.1 * B.torso, k: 1, fill: 1.1, mat: () => 'trim', veins: false });

  // ---- head: one big copy of the base shape + face plate + eyes
  const hs = B.head, hd = { w: 0.27 * hs, h: 0.31 * hs, d: 0.26 * hs };
  const hc = P['mixamorig:Head'].clone().add(V(0, 0.17 * hs, 0.02));
  hc.x = 0;
  if (gearFam) {
    put(base, hc, V(0, 0, 1), hd.w * 1.25, hd.d * 0.8, hd.h * 1.15, 'mixamorig:Head', pat === 'Inverted' ? 'trim' : 'body', { hint: V(0, 1, 0), spin: Math.PI / T.shape.teeth });
    put(helpers.ball(), hc.clone().add(V(0, 0, -0.03)), V(0, 1, 0), hd.w * 0.85, hd.h * 0.85, hd.d * 0.8, 'mixamorig:Head', 'trim');
  } else put(base, hc, V(0, 1, 0), hd.w, hd.h, hd.d, 'mixamorig:Head', pat === 'Inverted' ? 'trim' : 'body', { spin: 0 });
  const plate = { w: hd.w * 0.72, h: hd.h * 0.64, t: 0.024 };
  const pc = hc.clone().add(V(0, -hd.h * 0.04, (gearFam ? hd.d * 0.4 : hd.d * 0.5 * 0.88) + plate.t * 0.5));
  put(helpers.box(0.25), pc, V(0, 1, 0), plate.w, plate.h, plate.t, 'mixamorig:Head', 'face', { hint: V(0, 0, 1) });
  // eyes in the upper band of the plate; the lower ~60% stays blank for the laser face
  const ey = pc.y + plate.h * 0.24, ez = pc.z + plate.t * 0.5 + 0.004, ex = plate.w * 0.24;
  const E = (geo, x, y, w, h, d = 0.014) => put(geo, V(x, y, ez + d * 0.3), V(0, 1, 0), w, h, d, 'mixamorig:Head', 'glow', { hint: V(0, 0, 1) });
  switch (T.eyes) {
    case 'Twin Dots': E(helpers.ball(), -ex, ey, 0.05, 0.05, 0.025); E(helpers.ball(), ex, ey, 0.05, 0.05, 0.025); break;
    case 'Visor': E(helpers.box(0.4), 0, ey, plate.w * 0.82, 0.04, 0.02); break;
    case 'Cyclops': E(helpers.gem(), 0, ey, 0.075, 0.075, 0.03); break;
    case 'Seven Lights': for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 1.6; E(helpers.ball(), Math.sin(a) * plate.w * 0.4, ey + Math.cos(a) * 0.03 - 0.02, 0.026, 0.026, 0.018); } break;
    case 'Slits': E(helpers.box(0.3), -ex, ey, 0.024, 0.07, 0.02); E(helpers.box(0.3), ex, ey, 0.024, 0.07, 0.02); break;
    case 'Hex Lenses': {
      const hex = helpers.rod(6);
      for (const sx of [-1, 1]) put(hex, V(sx * ex, ey, ez + 0.006), V(0, 0, 1), 0.055, 0.016, 0.055, 'mixamorig:Head', 'glow'); break;
    }
  }
  const engraveZone = { joint: 'mixamorig:Head', center: [pc.x, pc.y - plate.h * 0.16, pc.z + plate.t / 2].map((v) => +v.toFixed(4)), size: [+(plate.w * 0.9).toFixed(4), +(plate.h * 0.6).toFixed(4)], normal: [0, 0, 1] };

  // crown
  const top = hc.y + hd.h * 0.5;
  const rC = subRng(T.seed, 'crown');
  switch (T.crown) {
    case 'Shard Crown': for (let i = 0; i < 5; i++) { const a = (i / 4 - 0.5) * 1.5; put(helpers.spike(5), V(Math.sin(a) * hd.w * 0.36, top + 0.02 + (i === 2 ? 0.03 : 0), hc.z + Math.cos(a) * 0.02), V(Math.sin(a) * 0.5, 1, 0), 0.045, i === 2 ? 0.13 : 0.09, 0.045, 'mixamorig:Head', 'trim'); } break;
    case 'Gear Halo': put(helpers.gear(7), hc.clone().add(V(0, hd.h * 0.15, -hd.d * 0.62)), V(0, 0, 1), hd.w * 1.5, 0.03, hd.w * 1.5, 'mixamorig:Head', 'trim', { hint: V(0, 1, 0) }); break;
    case 'Horns': for (const sx of [-1, 1]) put(base, V(sx * hd.w * 0.5, top - 0.02, hc.z), V(sx * 0.7, 1, 0), 0.05, 0.16, 0.05, 'mixamorig:Head', 'trim', { tz: 0 }); break;
    case 'Antenna': put(helpers.rod(5), V(hd.w * 0.25, top + 0.08, hc.z - 0.03), V(0, 1, 0), 0.012, 0.16, 0.012, 'mixamorig:Head', 'trim'); put(helpers.ball(), V(hd.w * 0.25, top + 0.17, hc.z - 0.03), V(0, 1, 0), 0.035, 0.035, 0.035, 'mixamorig:Head', 'glow'); break;
    case 'Fin': put(base, V(0, top + 0.03, hc.z - 0.02), V(0, 0.3, -1), 0.03, hd.d * 0.95, 0.09, 'mixamorig:Head', 'trim', { hint: V(0, 1, 0) }); break;
  }
  void rC;

  // chest core
  const chest = P['mixamorig:Spine2'].clone().lerp(P['mixamorig:Spine1'], 0.25); chest.x = 0;
  const cz = chest.z + 0.24 * B.torso * 0.5 + 0.01;
  switch (T.core) {
    case 'Gold Core': put(helpers.gem(), V(0, chest.y, cz), V(0, 1, 0), 0.08, 0.11, 0.05, 'mixamorig:Spine1', 'glow'); break;
    case 'Seven Lights': for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; put(helpers.ball(), V(Math.cos(a) * 0.055, chest.y + Math.sin(a) * 0.055, cz), V(0, 1, 0), 0.025, 0.025, 0.02, 'mixamorig:Spine1', 'glow'); } break;
    case 'Inlay Stripe': put(helpers.box(0.3), V(0, chest.y - 0.08, cz - 0.005), V(0, 1, 0), 0.04, 0.32, 0.02, 'mixamorig:Spine1', 'inlay'); put(helpers.gem(), V(0, chest.y + 0.02, cz + 0.005), V(0, 1, 0), 0.05, 0.07, 0.03, 'mixamorig:Spine1', 'glow'); break;
    case 'Gear Heart': put(helpers.gear(7), V(0, chest.y, cz), V(0, 0, 1), 0.13, 0.025, 0.13, 'mixamorig:Spine1', 'trim', { hint: V(0, 1, 0) }); put(helpers.ball(), V(0, chest.y, cz + 0.012), V(0, 1, 0), 0.04, 0.04, 0.02, 'mixamorig:Spine1', 'glow'); break;
  }
  // belt inlay
  put(helpers.box(0.3), V(0, P['mixamorig:Hips'].y + 0.02, P['mixamorig:Hips'].z), V(0, 1, 0), 0.36 * B.torso, 0.035, 0.235 * B.torso, 'mixamorig:Hips', 'inlay');

  // ---- arms & legs (mirrored)
  const L = B.limb;
  for (const S of ['Left', 'Right']) {
    const s = S[0], j = (n) => 'mixamorig:' + S + n, p = (n) => P[j(n)];
    limb('clav', s, p('Shoulder'), p('Arm'), j('Shoulder'), { w: 0.09 * L, d: 0.09 * L, k: 1, veins: false, mat: () => 'trim' });
    limb('uparm', s, p('Arm'), p('ForeArm'), j('Arm'), { w: 0.12 * L, d: 0.12 * L, mat: limbMat(false) });
    limb('foarm', s, p('ForeArm'), p('Hand'), j('ForeArm'), { w: 0.11 * L, d: 0.11 * L, mat: limbMat(true) });
    // hand block + 3 finger segments (so finger curl animates)
    const hDir = p('HandMiddle1').clone().sub(p('Hand'));
    put(helpers.box(0.35), p('Hand').clone().lerp(p('HandMiddle1'), 0.45), hDir, 0.05 * Math.sqrt(L), hDir.length() * 0.8, 0.095 * Math.sqrt(L), j('Hand'), 'trim');
    const fj = ['HandMiddle1', 'HandMiddle2', 'HandMiddle3', 'HandMiddle4'];
    for (let i = 0; i < 3; i++) {
      const a = p(fj[i]), b = i === 2 ? p(fj[3]).clone().add(p(fj[3]).clone().sub(p(fj[2])).multiplyScalar(0.6)) : p(fj[i + 1]);
      put(helpers.box(0.3), a.clone().lerp(b, 0.5), b.clone().sub(a), 0.038 * Math.sqrt(L), b.distanceTo(a) * 1.15 + 0.01, 0.085 * Math.sqrt(L), j(fj[i]), 'trim');
    }
    // pauldrons
    const ap = p('Arm');
    switch (T.pauldrons) {
      case 'Shape Pauldron': put(base, ap.clone().add(V(0, 0.04, 0)), V(s === 'L' ? 1 : -1, 0.6, 0), 0.19 * L, 0.15 * L, 0.17 * L, j('Arm'), 'trim', { spin: 0.3 }); break;
      case 'Gear Pauldron': put(helpers.gear(T.shape.teeth), ap.clone().add(V(s === 'L' ? 0.02 : -0.02, 0.05, 0)), V(s === 'L' ? 1 : -1, 0.5, 0), 0.2 * L, 0.05, 0.2 * L, j('Arm'), 'trim'); break;
      case 'Twin Spikes': for (const dz of [-0.04, 0.04]) put(helpers.spike(4), ap.clone().add(V(0, 0.07, dz)), V(s === 'L' ? 0.4 : -0.4, 1, 0), 0.05, 0.13, 0.05, j('Arm'), 'trim'); break;
    }
    // legs
    limb('thigh', s, p('UpLeg'), p('Leg'), j('UpLeg'), { w: 0.165 * L, d: 0.165 * L, mat: limbMat(false) });
    limb('shin', s, p('Leg'), p('Foot').clone().add(V(0, -0.04, 0)), j('Leg'), { w: 0.135 * L, d: 0.135 * L, mat: limbMat(true) });
    put(helpers.ball(), p('Leg').clone().add(V(0, 0, 0.05 * L)), V(0, 1, 0), 0.055 * L, 0.055 * L, 0.035, j('Leg'), 'inlay');
    // foot: horizontal block heel->ball bound to Foot, toe cap bound to ToeBase
    const fwd = p('ToeBase').clone().sub(p('Foot')); fwd.y = 0; fwd.normalize();
    const heel = p('Foot').clone().add(fwd.clone().multiplyScalar(-0.07)); heel.y = 0.06;
    const ball = p('ToeBase').clone(); ball.y = 0.06;
    put(base, heel.clone().lerp(ball, 0.5), ball.clone().sub(heel), 0.12 * Math.sqrt(L), heel.distanceTo(ball) * 0.95, 0.12, j('Foot'), 'trim', { hint: V(0, 1, 0) });
    const toe = ball.clone().add(fwd.clone().multiplyScalar(0.07)); toe.y = 0.035;
    put(helpers.box(0.4), ball.clone().lerp(toe, 0.5), toe.clone().sub(ball), 0.1 * Math.sqrt(L), 0.08, 0.06, j('ToeBase'), 'trim', { hint: V(0, 1, 0) });
    put(helpers.ball(), p('Foot'), V(0, 1, 0), 0.09 * Math.sqrt(L), 0.09, 0.09 * Math.sqrt(L), j('Foot'), 'trim');
  }
  return { buckets, engraveZone, stats };
}
