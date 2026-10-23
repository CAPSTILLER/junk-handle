// CAPs Rocks: wallet face (generator v1) -> flat inlay triangle mesh for 3D (preview GLB, full GLB, live viewer).
// Uses the frozen geometry() and the SPEC mask placement: face space x1.35, +6 mm down, tablet centred at the origin.
// Output units: metres on a 240 x 177.6 mm tablet scaled to `tabletW` metres; x right, y UP, z = 0 (front face).
import { traits, geometry, FACE_SCALE } from './faces_v1.mjs';

const SC = Number(FACE_SCALE);
const CURVE_SEGS = 12, CIRCLE_SEGS = 28, CAP_SEGS = 8;

/** Parse the generator's path strings (M/L/Q/a/Z only) into polylines in face units. */
export function pathPolylines(d) {
  const tok = d.match(/[MLQaZ]|-?\d+(?:\.\d+)?/g) || [];
  const lines = []; let cur = null, i = 0, x = 0, y = 0, sx = 0, sy = 0;
  const n = () => Number(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { x = n(); y = n(); sx = x; sy = y; cur = [[x, y]]; lines.push(cur); }
    else if (c === 'L') { x = n(); y = n(); cur.push([x, y]); }
    else if (c === 'Q') { const cx = n(), cy = n(), ex = n(), ey = n(); for (let k = 1; k <= CURVE_SEGS; k++) { const t = k / CURVE_SEGS, u = 1 - t; cur.push([u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey]); } x = ex; y = ey; }
    else if (c === 'a') { // generator only emits full circles as two half arcs: a r r 0 1 0 2r 0 a r r 0 1 0 -2r 0
      const r = n(); n(); n(); n(); n(); const dx = n(); n()
      const cx = x + dx / 2, start = dx > 0 ? Math.PI : 0
      for (let k = 1; k <= CIRCLE_SEGS / 2; k++) { const a = start - (k / (CIRCLE_SEGS / 2)) * Math.PI; cur.push([cx + r * Math.cos(a), y - r * Math.sin(a)]) }
      x += dx
    } else if (c === 'Z') { cur.push([sx, sy]); x = sx; y = sy; }
  }
  return lines;
}

/** Triangles (Float32Array xyz) for wallet face (address, variant). tabletW in metres (240 mm at head scale 1). */
export function faceTriangles(address, variant, tabletW = 0.24) {
  const t = traits(address, variant), g = geometry(t);
  const k = tabletW / 2400; // metres per 0.1 mm tablet unit
  const P = (x, y) => [x * SC * k, -(y * SC + 60) * k];
  const out = [];
  const tri = (a, b, c) => out.push(a[0], a[1], 0, b[0], b[1], 0, c[0], c[1], 0);
  const disc = (c, r, segs) => { for (let s = 0; s < segs; s++) { const a0 = (s / segs) * 2 * Math.PI, a1 = ((s + 1) / segs) * 2 * Math.PI; tri(c, [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)]); } };
  const hw = (g.lw * SC * k) / 2;
  for (const d of g.strokes) for (const line of pathPolylines(d)) {
    const pts = line.map(([x, y]) => P(x, y));
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 1e-9) continue;
      const nx = (-dy / L) * hw, ny = (dx / L) * hw;
      const a1 = [a[0] + nx, a[1] + ny], a2 = [a[0] - nx, a[1] - ny], b1 = [b[0] + nx, b[1] + ny], b2 = [b[0] - nx, b[1] - ny];
      tri(a1, a2, b2); tri(a1, b2, b1);
    }
    for (const p of pts) disc(p, hw, CAP_SEGS); // round caps + joins
  }
  for (const dt of g.dots) disc(P(dt.x, dt.y), dt.r * SC * k, 16);
  // CCW facing +z
  for (let i = 0; i < out.length; i += 9) {
    const cross = (out[i + 3] - out[i]) * (out[i + 7] - out[i + 1]) - (out[i + 4] - out[i + 1]) * (out[i + 6] - out[i]);
    if (cross < 0) for (let j = 0; j < 3; j++) { const t3 = out[i + 3 + j]; out[i + 3 + j] = out[i + 6 + j]; out[i + 6 + j] = t3; }
  }
  return new Float32Array(out);
}
export const FACE_INLAY_COLOR = '#eef2f5';
