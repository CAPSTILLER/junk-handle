// Extracts Cap's 36-joint Mixamo skeleton (names, hierarchy, inverse bind matrices)
// and animation clips from the Meshy GLBs. Cap's mesh/textures are never copied.
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three-foundry';

// CAPs Rocks (server): clip GLBs come from the decrypted private asset pack (see ../assets.mjs),
// never from files in the public repo. Each pack GLB is a stripped Meshy clip (skin + animation, no mesh).
import { packGlb } from '../assets.mjs';
const io = new NodeIO();
const cache = new Map();
async function readDoc(clip) {
  if (!cache.has(clip)) cache.set(clip, await io.readBinary(await packGlb('clip:' + clip)));
  return cache.get(clip);
}

export async function loadSkeleton() {
  const doc = await readDoc('Walking');
  const skin = doc.getRoot().listSkins()[0];
  const joints = skin.listJoints();
  const names = joints.map((j) => j.getName());
  const ibm = Array.from(skin.getInverseBindMatrices().getArray());
  const parent = {};
  for (const j of joints) {
    const p = j.listParents().find((x) => x.propertyType === 'Node' && names.includes(x.getName()));
    parent[j.getName()] = p ? p.getName() : null;
  }
  // bind-pose world matrices (inverse of IBM) and local TRS that reproduce them exactly
  const world = {}, local = {}, pos = {};
  names.forEach((n, i) => {
    world[n] = new THREE.Matrix4().fromArray(ibm.slice(i * 16, i * 16 + 16)).invert();
    pos[n] = new THREE.Vector3().setFromMatrixPosition(world[n]);
  });
  for (const n of names) {
    const m = parent[n] ? world[parent[n]].clone().invert().multiply(world[n]) : world[n].clone();
    const t = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(t, q, s);
    local[n] = { t: t.toArray(), r: q.toArray(), s: [1, 1, 1] };
  }
  return { names, ibm, parent, world, local, pos };
}

// Returns raw clip data: [{node, path, times(Float32Array), values(Float32Array), interp}]
export async function loadClip(clip) {
  const doc = await readDoc(clip);
  const anim = doc.getRoot().listAnimations()[0];
  return anim.listChannels().map((c) => ({
    node: c.getTargetNode().getName(),
    path: c.getTargetPath(),
    times: Float32Array.from(c.getSampler().getInput().getArray()),
    values: Float32Array.from(c.getSampler().getOutput().getArray()),
    interp: c.getSampler().getInterpolation(),
  }));
}

export function clipDuration(chs) {
  return Math.max(...chs.map((c) => c.times[c.times.length - 1]));
}

// Sample a channel at time t (LINEAR; slerp for rotations)
export function sampleChannel(ch, t) {
  const { times, values } = ch, n = ch.path === 'rotation' ? 4 : 3;
  if (t <= times[0]) return Array.from(values.slice(0, n));
  const last = times.length - 1;
  if (t >= times[last]) return Array.from(values.slice(last * n, last * n + n));
  let i = 0; while (times[i + 1] < t) i++;
  const a = (t - times[i]) / (times[i + 1] - times[i]);
  const A = values.slice(i * n, i * n + n), B = values.slice((i + 1) * n, (i + 1) * n + n);
  if (n === 4) {
    const q = new THREE.Quaternion().fromArray(A).slerp(new THREE.Quaternion().fromArray(B), a);
    return q.toArray();
  }
  return [0, 1, 2].map((k) => A[k] + (B[k] - A[k]) * a);
}
