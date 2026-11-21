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
/**
 * NET RESOLUTION: which Arduino pin is each device's signal pin really connected to?
 * Two pins are "the same net" when a wire joins them OR the part joins them internally
 * (breadboard columns/rails, a resistor's two ends - see `links` in registry.jsx).
 * Union-find keeps this fast even with hundreds of breadboard holes.
 *   devices : [{ id, type, x, y }]    wires : [{ a:{dev,pin}, b:{dev,pin} }]
 *   DEV     : the DEVICES catalogue   toPin : (pinId) => Arduino pin number or null (GND/5V/...)
 * Returns { role: pinNumber } e.g. { led: 13, soil: 14 }.
 */
export function resolveBindings(devices, wires, DEV, toPin) {
  const parent = new Map();
  const find = (k) => {
    if (!parent.has(k)) parent.set(k, k);
    while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); }   // path compression
    return k;
  };
  const join = (a, b) => parent.set(find(a), find(b));
  const key = (dev, pin) => `${dev}.${pin}`;
  for (const w of wires) join(key(w.a.dev, w.a.pin), key(w.b.dev, w.b.pin));                       // 1) every wire
  for (const d of devices) for (const g of DEV[d.type].links ?? []) for (let i = 1; i < g.length; i++) join(key(d.id, g[0]), key(d.id, g[i]));   // 2) internal links
  const unos = devices.filter((d) => d.type === "arduino");
  const out = {};
  for (const d of devices) {
    const def = DEV[d.type];
    if (!def.role || out[def.role] !== undefined) continue;          // first device of a role wins
    const root = find(key(d.id, def.sig));                           // the net of this device's signal pin
    search: for (const u of unos) for (const p of DEV.arduino.pins) {
      const n = toPin(p.id);                                         // only digital/analog pins count
      if (n !== null && find(key(u.id, p.id)) === root) { out[def.role] = n; break search; }
    }
  }
  return out;
}
