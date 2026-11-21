/**
 * geometry.js - small pure helpers for the circuit canvas (no React in here).
 */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Build the SVG path of a wire.
 *   a, b : end points {x,y} in WORLD units (already resolved from pin ids)
 *   pts  : user bend points (waypoints) in WORLD units, may be empty
 * With no waypoints the wire keeps the original "sagging" curve. With waypoints it becomes a
 * smooth Catmull-Rom spline that passes exactly through every waypoint.
 * Returns { d, mids } where mids[i] is the middle of segment i: dragging it inserts a new
 * waypoint at index i of `pts`.
 */
export function wireGeometry(a, b, pts = []) {
  let segs;
  if (!pts.length) {
    const my = Math.max(a.y, b.y) + 40;
    segs = [{ p0: a, c1: { x: a.x, y: my }, c2: { x: b.x, y: my }, p3: b }];
  } else {
    const P = [a, ...pts, b];
    segs = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
      segs.push({
        p0: p1, p3: p2,
        c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
        c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      });
    }
  }
  const d = `M${a.x},${a.y} ` + segs.map((s) => `C${s.c1.x},${s.c1.y} ${s.c2.x},${s.c2.y} ${s.p3.x},${s.p3.y}`).join(" ");
  const mids = segs.map((s, index) => ({
    index,
    x: (s.p0.x + 3 * s.c1.x + 3 * s.c2.x + s.p3.x) / 8,   // point of the Bezier at t = 0.5
    y: (s.p0.y + 3 * s.c1.y + 3 * s.c2.y + s.p3.y) / 8,
  }));
  return { d, mids };
}

/**
 * MAGNETIC SNAPPING: the pin closest to `pt` (WORLD units) within `maxDist`, or null.
 * `exclude` = {dev,pin} that must not be returned (the pin the wire starts from).
 */
export function nearestPin(devices, DEV, pt, maxDist, exclude) {
  let best = null;
  for (const d of devices) {
    for (const p of DEV[d.type].pins) {
      if (exclude && exclude.dev === d.id && exclude.pin === p.id) continue;
      const x = d.x + p.dx, y = d.y + p.dy, dist = Math.hypot(pt.x - x, pt.y - y);
      if (dist <= maxDist && (!best || dist < best.dist)) best = { dev: d.id, pin: p.id, name: p.name ?? p.id, x, y, dist };
    }
  }
  return best;
}
