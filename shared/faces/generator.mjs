// CAPs Rocks face generator interface. The UI, 3D preview and server baking only talk to this module,
// so the frozen generator can be swapped in without touching them.
// CURRENT IMPL: a non-final PLACEHOLDER (no sigil/crown/border; not hashed, not frozen). `ready` is false:
// the Add face buttons stay disabled and nothing is baked into GLBs/posters until the final v1 spec lands.
const MOODS = ['Calm', 'Based', 'Fierce', 'Sorrow', 'Joy', 'Prophet', 'Void'];
function h32(s) { let h = 2166136261; for (const c of s.toLowerCase()) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
function traits(address, variant) {
  const v = Number(variant) >>> 0, h = h32(address + ':' + Math.floor(v / 7));
  return { version: 1, variant: v, mood: MOODS[v % 7], spacing: 260 + (h % 120), eyeR: 50 + ((h >> 8) % 30), mouthW: 260 + ((h >> 16) % 160), placeholder: true };
}
const MOUTH = [0, 40, -10, -90, 120, 0, 0]; // control-point bend per mood (+ = smile)
const BROW = [0, 20, 70, -50, -20, 0, 0];
function geometry(t) {
  const m = MOODS.indexOf(t.mood), s = t.spacing, w = t.mouthW, strokes = [], dots = [];
  if (m === 6) strokes.push(`M${-s - 70} -150L${-s + 70} -150`, `M${s - 70} -150L${s + 70} -150`);
  else dots.push({ x: -s, y: -150, r: t.eyeR }, { x: s, y: -150, r: t.eyeR });
  strokes.push(`M${-s - 110} ${-300 + BROW[m]}L${-s + 110} ${-300 - BROW[m]}`, `M${s - 110} ${-300 - BROW[m]}L${s + 110} ${-300 + BROW[m]}`);
  strokes.push(`M0 -60L-40 90L30 90`);
  strokes.push(m === 5 ? `M${-w / 2} 300L${w / 2} 300` : `M${-w / 2} 300Q0 ${300 + MOUTH[m] * 2} ${w / 2} 300`);
  return { strokes, dots, lw: 17 };
}
function renderSvg(address, variant) {
  const g = geometry(traits(address, variant));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 2400" width="1024" height="1024" data-caps-face="placeholder"><rect x="0" y="312" width="2400" height="1776" fill="#2f5596"/><g transform="translate(1200 1200) translate(0 60) scale(1.35)" fill="none" stroke="#eef2f5" stroke-width="${g.lw}" stroke-linecap="round" stroke-linejoin="round">${g.strokes.map((d) => `<path d="${d}"/>`).join('')}${g.dots.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="#eef2f5" stroke="none"/>`).join('')}</g></svg>`;
}
export const FACE_GENERATOR = { id: 'placeholder', version: 1, ready: false, moods: MOODS, scale: 1.35, traits, geometry, renderSvg };
