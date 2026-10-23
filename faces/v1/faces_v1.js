// CAPs Rocks — Face Generator v1 (FROZEN). Reference implementation.
// Pure + deterministic: no Math.random, no Date, integer geometry (0.1 mm units), integer trig table.
// Only dependency: keccak_256 (@noble/hashes). PNG rendering (renderPng) uses @resvg/resvg-js and is NOT part of the hashed output.
import { keccak_256 } from '@noble/hashes/sha3.js';

export const GENERATOR_VERSION = 1;

// ---------------------------------------------------------------- integer trig: 1 turn = 1024 units, Q14 output
const SINQ = [0,101,201,302,402,503,603,704,804,904,1005,1105,1205,1306,1406,1506,1606,1706,1806,1906,2006,2105,2205,2305,2404,2503,2603,2702,2801,2900,2999,3098,3196,3295,3393,3492,3590,3688,3786,3883,3981,4078,4176,4273,4370,4467,4563,4660,4756,4852,4948,5044,5139,5235,5330,5425,5520,5614,5708,5803,5897,5990,6084,6177,6270,6363,6455,6547,6639,6731,6823,6914,7005,7096,7186,7276,7366,7456,7545,7635,7723,7812,7900,7988,8076,8163,8250,8337,8423,8509,8595,8680,8765,8850,8935,9019,9102,9186,9269,9352,9434,9516,9598,9679,9760,9841,9921,10001,10080,10159,10238,10316,10394,10471,10549,10625,10702,10778,10853,10928,11003,11077,11151,11224,11297,11370,11442,11514,11585,11656,11727,11797,11866,11935,12004,12072,12140,12207,12274,12340,12406,12472,12537,12601,12665,12729,12792,12854,12916,12978,13039,13100,13160,13219,13279,13337,13395,13453,13510,13567,13623,13678,13733,13788,13842,13896,13949,14001,14053,14104,14155,14206,14256,14305,14354,14402,14449,14497,14543,14589,14635,14680,14724,14768,14811,14854,14896,14937,14978,15019,15059,15098,15137,15175,15213,15250,15286,15322,15357,15392,15426,15460,15493,15525,15557,15588,15619,15649,15679,15707,15736,15763,15791,15817,15843,15868,15893,15917,15941,15964,15986,16008,16029,16049,16069,16088,16107,16125,16143,16160,16176,16192,16207,16221,16235,16248,16261,16273,16284,16295,16305,16315,16324,16332,16340,16347,16353,16359,16364,16369,16373,16376,16379,16381,16383,16384,16384];
export function isin(a) { a = ((a % 1024) + 1024) % 1024; if (a <= 256) return SINQ[a]; if (a <= 512) return SINQ[512 - a]; if (a <= 768) return -SINQ[a - 512]; return -SINQ[1024 - a]; }
export function icos(a) { return isin(a + 256); }
const idiv = (a, b) => Math.trunc(a / b);
const isqrt = (n) => { let r = Math.floor(Math.sqrt(n)); while (r * r > n) r--; while ((r + 1) * (r + 1) <= n) r++; return r; };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// ---------------------------------------------------------------- seeds
const hexToBytes = (h) => Uint8Array.from(h.replace(/^0x/i, '').match(/../g).map((x) => parseInt(x, 16)));
export const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
function addrBytes(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('bad address ' + address);
  return hexToBytes(address.toLowerCase());
}
/** identity seed: keccak256(abi.encodePacked(address, uint16 version)) — the same for every variant */
export function identitySeed(address, version = GENERATOR_VERSION) {
  const a = addrBytes(address), m = new Uint8Array(22);
  m.set(a, 0); m[20] = (version >> 8) & 255; m[21] = version & 255;
  return keccak_256(m);
}
/** variant seed: keccak256(abi.encodePacked(address, uint16 version, uint32 variant)) — the exact onchain tuple */
export function variantSeed(address, variant, version = GENERATOR_VERSION) {
  if (!Number.isInteger(variant) || variant < 0 || variant > 0xffffffff) throw new Error('variant must be uint32');
  const a = addrBytes(address), m = new Uint8Array(26);
  m.set(a, 0); m[20] = (version >> 8) & 255; m[21] = version & 255;
  m[22] = (variant >>> 24) & 255; m[23] = (variant >>> 16) & 255; m[24] = (variant >>> 8) & 255; m[25] = variant & 255;
  return keccak_256(m);
}
/** Pen Plot v4 'hashed' sigil key: keccak256(20 address bytes) (only bytes 0,2,3,10 are used here) */
export function sigilSeed(address) { return keccak_256(addrBytes(address)); }

// weighted pick on one byte; weights sum to 256
function pick(byte, table) { let acc = 0; for (const [name, w] of table) { acc += w; if (byte < acc) return name; } throw new Error('weights'); }

export const EYES = [['Almond', 48], ['Round', 40], ['Slit', 32], ['Hollow', 32], ['Diamond', 28], ['Crescent', 28], ['Spiral', 24], ['Twin', 24]];
export const BROWS = [['Straight', 64], ['Arched', 56], ['Angled', 48], ['Heavy', 32], ['Split', 32], ['None', 24]];
export const NOSES = [['None', 40], ['Line', 72], ['Hook', 56], ['Dots', 48], ['Wedge', 40]];
export const MARKS = [['None', 96], ['Crack', 48], ['Scar', 40], ['Tally7', 32], ['Freckle Dots', 40]];
export const WEIGHTS = [['Fine', 80], ['Standard', 112], ['Bold', 64]];
export const LINE_W = { Fine: 14, Standard: 17, Bold: 20 }; // 0.1 mm in face space; x1.35 FACE_SCALE => 1.9 / 2.3 / 2.7 mm on the tablet
export const MOODS = ['Calm', 'Based', 'Fierce', 'Sorrow', 'Joy', 'Prophet', 'Void'];
const EYE_SPACING = [330, 380, 430], EYE_Y = [-90, -60, -30], MOUTH_W = [240, 310, 380], MOUTH_Y = [300, 340, 380];

export function traits(address, variant, version = GENERATOR_VERSION) {
  if (version !== 1) throw new Error('faces_v1 only renders generatorVersion 1');
  const A = identitySeed(address, version), V = variantSeed(address, variant, version), S = sigilSeed(address);
  const sig = sigilParams(S);
  const drift = variant >= 7
    ? { dx: (V[0] % 41) - 20, dy: (V[1] % 31) - 15, brow: (V[2] % 61) - 30, mouthW: (V[3] % 61) - 30, mouthC: (V[4] % 61) - 30 }
    : { dx: 0, dy: 0, brow: 0, mouthW: 0, mouthC: 0 };
  return {
    version, variant,
    eyes: pick(A[0], EYES), eyeSpacing: EYE_SPACING[A[1] % 3], eyeY: EYE_Y[A[2] % 3],
    brows: pick(A[3], BROWS), nose: pick(A[4], NOSES),
    mouthW: MOUTH_W[A[5] % 3], mouthY: MOUTH_Y[(A[5] >> 2) % 3],
    marks: pick(A[6], MARKS), markSide: (A[10] & 1) ? 'right' : 'left',
    crown: A[7] < 37, seer: A[8] < 8,
    weight: pick(A[11], WEIGHTS),
    sigil: sig.label, sigilFamily: sig.family,
    mood: MOODS[variant % 7], drift,
    _sig: sig,
  };
}

// ---------------------------------------------------------------- forehead sigil (Pen Plot v4 key, integer port)
function sigilParams(b) {
  const family = ['rose', 'lissajous', 'spirograph', 'star'][b[0] % 4];
  if (family === 'rose') {
    let n = [2, 3, 4, 5, 6, 7, 5, 7][b[2] & 7], d = [1, 1, 1, 2, 1, 2, 1, 3][(b[2] >> 3) & 7];
    const g = gcd(n, d); n /= g; d /= g;
    return { family, n, d, inner: 150 + idiv((b[10] >> 4) * 250, 15), ph: (b[3] * 128) >> 8, label: 'rose k=' + n + (d > 1 ? '/' + d : '') };
  }
  if (family === 'lissajous') {
    const [a, c] = [[1, 2], [2, 3], [3, 4], [3, 5], [4, 5], [5, 6], [1, 3], [2, 5]][b[2] & 7];
    return { family, a, c, ph: b[3] * 2, label: 'lissajous ' + a + ':' + c };
  }
  if (family === 'spirograph') {
    const q = [3, 4, 5, 5, 6, 7, 7, 8][b[2] & 7];
    let p = 1 + ((b[2] >> 3) % (q - 1));
    while (gcd(p, q) !== 1) p = p + 1 >= q ? 1 : p + 1;
    const hypo = (b[10] & 1) === 0;
    return { family, p, q, hypo, dd: 500 + idiv(b[3] * 1400 * p, 255 * q), label: (hypo ? 'hypo' : 'epi') + 'trochoid ' + p + '/' + q };
  }
  const n = [5, 6, 7, 8, 9, 10, 11, 12][b[2] & 7];
  const m = 2 + ((b[2] >> 3) % Math.max(1, Math.floor((n - 1) / 2) - 1));
  return { family, n, m, rings: 2 + (b[3] % 2), twist: idiv(512 * (b[10] & 3), 2 * n), label: 'star {' + n + '/' + m + '}x' + (2 + (b[3] % 2)) };
}
function sigilPaths(s, cx, cy, R) {
  const out = []; // unit coords are per-mille
  const put = (pts) => out.push(pts.map(([x, y]) => [cx + idiv(x * R, 1000), cy - idiv(y * R, 1000)]));
  if (s.family === 'rose') {
    const M = 360 * s.d, pts = [];
    for (let j = 0; j <= M; j++) {
      const t = idiv(j * 1024, 360), kt = idiv(s.n * j * 1024, 360 * s.d);
      const r = s.inner + idiv((1000 - s.inner) * icos(kt), 16384);
      pts.push([idiv(r * icos(t + s.ph), 16384), idiv(r * isin(t + s.ph), 16384)]);
    }
    put(pts);
  } else if (s.family === 'lissajous') {
    const pts = [];
    for (let j = 0; j <= 720; j++) { const t = idiv(j * 1024, 720); pts.push([idiv(1000 * isin(s.a * t + s.ph), 16384), idiv(1000 * isin(s.c * t), 16384)]); }
    put(pts);
  } else if (s.family === 'spirograph') {
    const rP = idiv(s.p * 1000, s.q), ddr = idiv(s.dd * rP, 1000), M = 360 * s.p, raw = [];
    for (let j = 0; j <= M; j++) {
      const t = idiv(j * 1024, 360);
      if (s.hypo) { const k = idiv((s.q - s.p) * t, s.p); raw.push([idiv((1000 - rP) * icos(t) + ddr * icos(k), 16384), idiv((1000 - rP) * isin(t) - ddr * isin(k), 16384)]); }
      else { const k = idiv((s.q + s.p) * t, s.p); raw.push([idiv((1000 + rP) * icos(t) - ddr * icos(k), 16384), idiv((1000 + rP) * isin(t) - ddr * isin(k), 16384)]); }
    }
    let mx = 1; for (const [x, y] of raw) mx = Math.max(mx, isqrt(x * x + y * y));
    put(raw.map(([x, y]) => [idiv(x * 1000, mx), idiv(y * 1000, mx)]));
  } else {
    const sc = [1000, 580, 336], g = gcd(s.n, s.m), per = s.n / g;
    for (let k = 0; k < s.rings; k++) for (let c = 0; c < g; c++) {
      const pts = [];
      for (let i = 0; i <= per; i++) { const a = 256 + k * s.twist + idiv(1024 * (c + i * s.m), s.n); pts.push([idiv(sc[k] * icos(a), 16384), idiv(sc[k] * isin(a), 16384)]); }
      put(pts);
    }
  }
  return out;
}

// ---------------------------------------------------------------- geometry -> engraving primitives
// Tablet: 240.0 x 177.6 mm (avatar-foundry face tablet, landscape 1 : 0.74). Units 0.1 mm. Origin = tablet centre, y down.
export const TABLET = { w: 2400, h: 1776, border: { inset: 110, width: 55 }, safe: { x: 1000, y: 688 } };

const MOOD = {
  //        inner-brow dy (+ = lowered/angry), brow lift, lid, pupil dy, mouth curve (+ = smile), mouth style
  Calm:    { tilt: 0,   lift: 0,   lid: 'half',   pdy: 10,  curve: 50,   mouth: 'line' },
  Based:   { tilt: 0,   lift: 0,   lid: 'open',   pdy: 0,   curve: 0,    mouth: 'smirk' },
  Fierce:  { tilt: 110, lift: 30,  lid: 'squint', pdy: 0,   curve: -60,  mouth: 'teeth' },
  Sorrow:  { tilt: -100, lift: 0,  lid: 'open',   pdy: 30,  curve: -110, mouth: 'line' },
  Joy:     { tilt: -20, lift: -50, lid: 'happy',  pdy: 0,   curve: 150,  mouth: 'open' },
  Prophet: { tilt: -30, lift: -30, lid: 'closed', pdy: 0,   curve: 20,   mouth: 'o' },
  Void:    { tilt: 0,   lift: 0,   lid: 'void',   pdy: 0,   curve: 0,    mouth: 'flat' },
};

export function geometry(t) {
  const P = []; // { d } strokes ; D = dots { x, y, r }
  const D = [];
  const lw = LINE_W[t.weight], m = MOOD[t.mood], dr = t.drift;
  const path = (pts, close = false) => P.push('M' + pts.map(([x, y]) => x + ' ' + y).join('L') + (close ? 'Z' : ''));
  const q = (x0, y0, cx, cy, x1, y1) => P.push('M' + x0 + ' ' + y0 + 'Q' + cx + ' ' + cy + ' ' + x1 + ' ' + y1);
  const circle = (x, y, r) => P.push('M' + (x - r) + ' ' + y + 'a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0a' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0');
  const dot = (x, y, r) => D.push({ x, y, r });
  const pr = 26 + idiv(lw, 2); // pupil radius

  const ey = t.eyeY + dr.dy;
  for (const s of [-1, 1]) {
    const ex = s * (t.eyeSpacing + dr.dx), w = 115;
    const inner = ex - s * w, outer = ex + s * w;
    // ---- brows
    const by = ey - 170 + m.lift, tilt = m.tilt + dr.brow;
    let bi = by + tilt, bo = by - idiv(tilt, 3);
    if (t.mood === 'Based' && s === 1) { bi -= 50; bo -= 60; }
    if (m.lid !== 'void') {
      const bx0 = ex - s * 130, bx1 = ex + s * 140;
      if (t.brows === 'Straight') path([[bx0, bi], [bx1, bo]]);
      else if (t.brows === 'Arched') q(bx0, bi, ex, Math.min(bi, bo) - 60, bx1, bo + 20);
      else if (t.brows === 'Angled') path([[bx0, bi], [ex + s * 50, Math.min(bi, bo) - 45], [bx1, bo + 35]]);
      else if (t.brows === 'Heavy') { path([[bx0, bi], [bx1, bo]]); path([[bx0 + s * 15, bi - 38], [bx1 - s * 10, bo - 38]]); }
      else if (t.brows === 'Split') { path([[bx0, bi], [ex - s * 15, idiv(bi + bo, 2)]]); path([[ex + s * 25, idiv(bi + bo, 2) - 4], [bx1, bo]]); }
    }
    // ---- eyes
    const lid = m.lid;
    if (lid === 'happy') { q(ex - w, ey + 25, ex, ey - 95, ex + w, ey + 25); continue; }
    if (lid === 'closed') {
      q(ex - w, ey - 10, ex, ey + 70, ex + w, ey - 10);
      for (const k of [-1, 0, 1]) path([[ex + k * 55, ey + 30 - (k === 0 ? 0 : 4)], [ex + k * 75, ey + 75]]);
      continue;
    }
    const py = ey + m.pdy, px = ex;
    const pupil = lid !== 'void';
    switch (t.eyes) {
      case 'Almond': q(ex - w, ey, ex, ey - 95, ex + w, ey); q(ex - w, ey, ex, ey + 85, ex + w, ey); break;
      case 'Round': circle(ex, ey, 85); break;
      case 'Slit': path([[ex - w, ey + 20], [ex + w, ey + 20]]); break;
      case 'Hollow': circle(ex, ey, 85); if (pupil) circle(px, py, 34); break;
      case 'Diamond': path([[ex - w, ey], [ex, ey - 75], [ex + w, ey], [ex, ey + 75]], true); break;
      case 'Crescent': q(ex - w, ey - 10, ex, ey + 115, ex + w, ey - 10); break;
      case 'Spiral': { const pts = []; for (let j = 0; j <= 112; j++) { const a = s * j * 16, r = 15 + idiv(75 * j, 112); pts.push([ex + idiv(r * icos(a), 16384), ey + idiv(r * isin(a), 16384)]); } path(pts); break; }
      case 'Twin': path([[ex - w, ey - 45], [ex + w, ey - 45]]); path([[ex - w + 25, ey + 45], [ex + w - 25, ey + 45]]); break;
    }
    if (pupil && t.eyes !== 'Hollow') dot(px, t.eyes === 'Slit' ? ey - 15 : t.eyes === 'Crescent' ? ey - 5 + m.pdy : py, pr);
    if (lid === 'half') path([[ex - w + 10, ey - 30], [ex + w - 10, ey - 30]]);
    if (lid === 'squint') path([[outer, ey - 55], [inner, ey - 10]]);
    if (t.mood === 'Sorrow' && s === (t.markSide === 'left' ? 1 : -1)) { dot(ex + s * 40, ey + 150, 20); dot(ex + s * 46, ey + 215, 15); }
  }
  // ---- nose
  const ny0 = ey + 70, ny1 = Math.min(ey + 230, t.mouthY - 110);
  if (t.nose === 'Line') path([[0, ny0], [0, ny1]]);
  else if (t.nose === 'Hook') q(0, ny0, -10, ny1, 55, ny1 - 10);
  else if (t.nose === 'Dots') { dot(-38, ny1, 18); dot(38, ny1, 18); }
  else if (t.nose === 'Wedge') path([[0, ny0], [-45, ny1], [40, ny1]]);
  // ---- mouth
  const my = t.mouthY + dr.dy, mw = t.mouthW + dr.mouthW, c = m.curve + dr.mouthC;
  if (m.mouth === 'line') q(-mw, my - idiv(c, 2), 0, my + c, mw, my - idiv(c, 2));
  else if (m.mouth === 'smirk') { q(-mw, my + 10, 0, my + 30, mw, my - 60); path([[mw - 10, my - 60], [mw + 30, my - 85]]); }
  else if (m.mouth === 'teeth') { const h = 55; path([[-mw, my - h + 30], [mw, my - h + 30]]); q(-mw, my - h + 30, 0, my + h - c, mw, my - h + 30); for (const k of [-2, -1, 0, 1, 2]) path([[k * idiv(mw, 3), my - h + 30], [k * idiv(mw, 3), my + 5 - (k === 0 || k === 1 || k === -1 ? 0 : 25)]]); }
  else if (m.mouth === 'open') { path([[-mw, my - 40], [mw, my - 40]]); q(-mw, my - 40, 0, my + c + 40, mw, my - 40); }
  else if (m.mouth === 'o') circle(0, my, 42);
  else if (m.mouth === 'flat') path([[-mw, my], [mw, my]]);
  // ---- marks (identity)
  const side = t.markSide === 'left' ? -1 : 1, mx = side * t.eyeSpacing;
  if (t.marks === 'Crack') path([[side * 700, -510], [side * 650, -420], [side * 715, -350], [side * 640, -250], [side * 675, -180]]);
  else if (t.marks === 'Scar') for (const k of [-1, 0, 1]) path([[mx - 120 + k * 45, ey - 250], [mx + 60 + k * 45, ey + 120]]);
  else if (t.marks === 'Tally7') { const x0 = side * 560 - 140, y0 = ey + 190; for (let k = 0; k < 7; k++) path([[x0 + k * 40, y0], [x0 + k * 40, y0 + 120]]); path([[x0 - 30, y0 + 100], [x0 + 270, y0 + 20]]); }
  else if (t.marks === 'Freckle Dots') for (const s of [-1, 1]) for (let k = 0; k < 3; k++) dot(s * t.eyeSpacing + s * (k - 1) * 55, ey + 175 + (k === 1 ? 20 : 0), 15);
  // ---- forehead: seer third eye, sigil, seven-dot crown
  const sigY = t.seer ? -425 : -375, sigR = t.seer ? 58 : 72;
  if (t.seer) { q(-90, ey - 250, 0, ey - 330, 90, ey - 250); q(-90, ey - 250, 0, ey - 170, 90, ey - 250); if (m.lid !== 'void') dot(0, ey - 250, 20); }
  for (const pts of sigilPaths(t._sig, 0, sigY, sigR)) path(pts);
  if (t.mood === 'Prophet') for (let k = 0; k < 7; k++) { const a = 256 + idiv(1024 * k, 7); path([[idiv(92 * icos(a), 16384), sigY - idiv(92 * isin(a), 16384)], [idiv(118 * icos(a), 16384), sigY - idiv(118 * isin(a), 16384)]]); }
  if (t.crown) for (let k = -3; k <= 3; k++) dot(k * 115, (t.seer ? -540 : -525) + k * k * 14, 18);
  return { strokes: P, dots: D, lw };
}

// ---------------------------------------------------------------- SVG (canonical, hashed) — 2400x2400 viewBox, 1 unit = 0.1 mm
const OFF = 1200;
export const FACE_SCALE = '1.35'; // face space -> tablet space (applied as an SVG transform, part of the frozen output)
function tabletOutline() {
  const w = 1200, h = 888, c = 60;
  return [[-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c], [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c]].map(([x, y]) => x + ' ' + y).join('L');
}
export const COLORS = { stone: '#2f5596', stoneDeep: '#24467f', groove: '#16305c', inlay: '#eef2f5' };
/** mode 'albedo' = tablet blue + white inlay; 'mask' = white lines on black (inlay mask / height map source) */
export function renderSvg(address, variant, { mode = 'albedo', version = GENERATOR_VERSION } = {}) {
  const t = traits(address, variant, version), g = geometry(t);
  const lines = g.strokes.map((d) => '<path d="' + d + '"/>').join('');
  const dots = g.dots.map((d) => '<circle cx="' + d.x + '" cy="' + d.y + '" r="' + d.r + '"/>').join('');
  const b = TABLET.border, bi = 1200 - b.inset - idiv(b.width, 2), bj = 888 - b.inset - idiv(b.width, 2);
  const border = '<path d="M' + -bi + ' ' + -bj + 'H' + bi + 'V' + bj + 'H' + -bi + 'Z" fill="none" stroke-width="' + b.width + '"/>';
  const art = (stroke, fill, w) => '<g fill="none" stroke="' + stroke + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round">' + lines + '</g><g fill="' + fill + '" stroke="none">' + dots + '</g>';
  let body;
  if (mode === 'mask') body = '<g transform="translate(' + OFF + ' ' + OFF + ')"><g stroke="#fff">' + border + '</g>' + '<g transform="translate(0 60) scale(' + FACE_SCALE + ')">' + art('#fff', '#fff', g.lw) + '</g>' + '</g>';
  else body = '<defs><radialGradient id="s" cx="0.45" cy="0.4" r="0.75"><stop offset="0" stop-color="' + COLORS.stone + '"/><stop offset="1" stop-color="' + COLORS.stoneDeep + '"/></radialGradient></defs>'
    + '<g transform="translate(' + OFF + ' ' + OFF + ')"><path d="M' + tabletOutline() + 'Z" fill="url(#s)"/>'
    + '<g transform="translate(5 7)" stroke="' + COLORS.groove + '" opacity="0.8">' + border + '<g transform="translate(0 60) scale(' + FACE_SCALE + ')">' + art(COLORS.groove, COLORS.groove, g.lw + 6) + '</g></g>'
    + '<g stroke="' + COLORS.inlay + '">' + border + '</g><g transform="scale(' + FACE_SCALE + ')">' + art(COLORS.inlay, COLORS.inlay, g.lw) + '</g></g>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 2400" width="1024" height="1024" data-caps-face="v' + version + '" data-variant="' + variant + '">' + (mode === 'mask' ? '<rect width="2400" height="2400"/>' : '') + body + '</svg>';
}
export function svgHash(svg) { return '0x' + toHex(keccak_256(new TextEncoder().encode(svg))); }

export async function renderPng(svg, size = 1024) {
  const { Resvg } = await import('@resvg/resvg-js');
  return new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } }).render().asPng();
}
export function publicTraits(t) { const { _sig, ...rest } = t; return rest; }
