/**
 * App.jsx - TanzSim dashboard (header, code editor, circuit canvas, controls, serial monitor).
 *
 * DATA MODEL (all plain JSON so scenarios can live in api/config.py):
 *   devices : [{ id, type, x, y }]            type must exist in components/registry.jsx
 *   wires   : [{ id, a:{dev,pin}, b:{dev,pin}, color }]
 *   sim     : { soil_moisture, temperature, ambient, button }
 * The browser owns `sim`; each tick it is sent to the backend, which runs the student's
 * loop() and the physics, then returns the new `sim`. No student code runs in the browser.
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Play, Pause, StepForward, RotateCcw, Plus, Trash2, Eraser, CheckCircle2 } from "lucide-react";
import { DEVICES } from "./components/registry.jsx";
import { ZoomControls, WirePopover } from "./components/CanvasTools.jsx";
import { clamp, wireGeometry, nearestPin, resolveBindings } from "./lib/geometry.js";

const WIRE_COLORS = { Red: "#d62828", Black: "#111111", Green: "#019212", Blue: "#2e7dd7", Yellow: "#e0a400", Orange: "#f08c00", White: "#f4f4f4", Purple: "#7b3fb5", Brown: "#7a4b2a" };
const MIN_K = 0.2, MAX_K = 5;                                                       // zoom limits
const COARSE = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;   // finger instead of mouse
const SNAP_PX = COARSE ? 34 : 24;                                                   // magnet radius in SCREEN pixels
const SESSION = Math.random().toString(36).slice(2);  // one sketch memory per browser tab
const api = (path, body) => fetch(`/api/${path}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined).then((r) => r.json());

/** Convert 'D8' -> 8, 'A0' -> 14, power pins -> null (Arduino numbering). */
const pinNumber = (id) => (/^D\d+$/.test(id) ? +id.slice(1) : /^A\d$/.test(id) ? 14 + +id.slice(1) : null);

/** Absolute WORLD position of a pin = device position + the anchor from the registry. */
const pinPos = (devices, ref) => {
  const d = devices.find((x) => x.id === ref.dev);
  const p = d && DEVICES[d.type].pins.find((q) => q.id === ref.pin);
  return d && p ? { x: d.x + p.dx, y: d.y + p.dy } : null;
};
/** Turn a status LED on for a moment (used for the TX/RX LEDs). `set` is a React state setter. */
const pulse = (set) => { set(true); setTimeout(() => set(false), 350); };

/** Pin highlight ring + name label. Drawn at a constant SCREEN size (inv = 1 / zoom). */
const Tip = ({ x, y, text, inv }) => (
  <g pointerEvents="none" transform={`translate(${x},${y}) scale(${inv})`}>
    <circle r="11" fill="none" stroke="#e0a400" strokeWidth="2.5" />
    <rect x={-(text.length * 3.4 + 6)} y="-38" width={text.length * 6.8 + 12} height="18" rx="4" fill="#01790f" />
    <text y="-25" fontSize="11" fill="#fff" textAnchor="middle">{text}</text>
  </g>
);

export default function App() {
  const [cfg, setCfg] = useState(null);
  const [devices, setDevices] = useState([]);
  const [wires, setWires] = useState([]);
  const [code, setCode] = useState("");
  const [sim, setSim] = useState({ soil_moisture: 40, temperature: 27, ambient: 28, button: false });
  const [outputs, setOutputs] = useState({});
  const [serial, setSerial] = useState([]);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [online, setOnline] = useState(false);
  const [menu, setMenu] = useState(false);
  const [wireColor, setWireColor] = useState("#019212");
  const [selected, setSelected] = useState(null);     // selected device id (for Delete)
  const [drag, setDrag] = useState(null);             // { id, ox, oy } while moving a device
  const [pending, setPending] = useState(null);       // { from, x, y } while dragging a NEW wire
  const [powered, setPowered] = useState(false);      // board power LED: true once the simulation has started
  const [tx, setTx] = useState(false);                // TX LED pulse (Serial output)
  const [rx, setRx] = useState(false);                // RX LED pulse (reset / validate = "host talks to board")
  const [resetDown, setResetDown] = useState(false);  // RESET button looks pressed
  const [hover, setHover] = useState(null);           // pin under the mouse: { x, y, text }
  // ---- NEW: zoom / pan, wire editing, snapping ----
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });   // screen = world * k + (x, y)
  const [size, setSize] = useState({ w: 0, h: 0 });          // size of the canvas box in px
  const [selWire, setSelWire] = useState(null);               // { id, sx, sy } wire being edited + where it was tapped
  const [hdrag, setHdrag] = useState(null);                   // wire handle being dragged: {type:"end",id,end,x,y} | {type:"pt",id,index}
  const [snap, setSnap] = useState(null);                     // pin the dragged wire end would snap to
  const svgRef = useRef(null); const stageRef = useRef(null);
  const viewRef = useRef(view); viewRef.current = view;       // always-fresh copy for event handlers
  const ptrs = useRef(new Map());                             // active pointers (1 = pan/drag, 2 = pinch zoom)
  const pan = useRef(null); const gesture = useRef(null); const needFit = useRef(true);
  const latest = useRef({}); const busy = useRef(false); const sketchRef = useRef(null); const needReset = useRef(true);  // sketchRef = sketch memory returned by the server

  // ---- load institution config (branding, crops, scenarios) once ----
  useEffect(() => {
    api("config").then((c) => {
      setCfg(c); setOnline(true);
      const t = c.institution.theme, r = document.documentElement.style;  // applyTheme
      Object.entries(t).forEach(([k, v]) => r.setProperty("--" + k.replace(/_/g, "-"), v));   // theme keys -> CSS variables (green_deep -> --green-deep)
      loadScenario(c.scenarios[0]);
    }).catch(() => setOnline(false));
  }, []);

  const loadScenario = (s) => {
    setDevices(s.devices.map((d) => ({ ...d })));
    setWires(s.wires.map(([da, pa, db, pb, color], i) => ({ id: `w${i}`, a: { dev: da, pin: pa }, b: { dev: db, pin: pb }, color, pts: [] })));
    setCode(s.code); setSerial([]); setError(""); setRunning(false); needReset.current = true;
    setPowered(false); sketchRef.current = null;   // a freshly loaded scenario starts "unplugged"
    setSelWire(null); setSelected(null); needFit.current = true;   // re-centre the view for the new circuit
  };

   // ---- AUTOMATIC PIN MAPPING (net based): follows wires AND the inside of breadboards / resistors ----
  // ---- AUTOMATIC PIN MAPPING (net based): follows wires AND the inside of breadboards / resistors ----
  const bindings = useMemo(() => resolveBindings(devices, wires, DEVICES, pinNumber), [devices, wires]);

  latest.current = { code, sim, bindings };

  // ---- ONE SIMULATION TICK: backend runs loop() + physics ----
  const tick = useCallback(async () => {
    if (busy.current) return; busy.current = true;
    try {
      const { code, sim, bindings } = latest.current;
      const r = await api("tick", { session_id: SESSION, code, state: sim, bindings, dt: 1.0, reset: needReset.current, sketch: needReset.current ? null : sketchRef.current });
      needReset.current = false; setOnline(true); if (r.sketch) sketchRef.current = r.sketch;
      setSim(r.state); setOutputs(r.outputs || {}); setError(r.error || "");
      if (r.serial?.length) { setSerial((s) => [...s, ...r.serial].slice(-300)); pulse(setTx); }  // TX blinks on Serial output
      setPowered(true);                                                                           // a tick means the board has power
      if (r.error) setRunning(false);   // stop on a code error so the student can fix it
    } catch { setOnline(false); setRunning(false); }
    busy.current = false;
  }, []);

  useEffect(() => { if (!running) return; const t = setInterval(tick, 1000); return () => clearInterval(t); }, [running, tick]);

  const reset = () => { setRunning(false); setSerial([]); setError(""); needReset.current = true; sketchRef.current = null; setPowered(false); const c = cfg.crops[0]; setSim({ soil_moisture: c.soil, temperature: c.temp, ambient: c.ambient, button: false }); setOutputs({}); };
  const validate = async () => { pulse(setRx); const r = await api("validate", { code }); setError(r.ok ? "" : r.error); if (r.ok) setSerial((s) => [...s, "[OK] Code compiled without errors."]); };
  /** RESET button on the Arduino: restart the sketch like pressing the real button. */
  const boardReset = () => {
    needReset.current = true; sketchRef.current = null;   // next tick runs setup() again with fresh variables
    setOutputs({});                                        // all digital outputs go back to LOW (pump, fan, LED off)
    setPowered(true); pulse(setRx);
    setSerial((s) => [...s, "[RESET] Arduino Uno restarted (setup() / initial state)"]);
  };
  /** Everything UnoArt needs to draw its LEDs and the RESET button. */
  const board = { powered, l13: powered && outputs[13] === 1, tx, rx, resetDown };
  const applyCrop = (id) => { const c = cfg.crops.find((x) => x.id === id); setSim((s) => ({ ...s, soil_moisture: c.soil, temperature: c.temp, ambient: c.ambient })); setSerial((s) => [...s, `[PRESET] ${c.name}: irrigate when soil < ${c.dry_below}%`]); };

  // ================= CANVAS: size, zoom, pan =================
  // Track the canvas box size (needed for "fit to screen" and zoom buttons).
  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(read); ro.observe(el); read();
    return () => ro.disconnect();
  }, [cfg]);

  /** Fit every device inside the canvas (also the "Reset view" button). */
  const fit = useCallback(() => {
    if (!size.w || !devices.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const d of devices) { const df = DEVICES[d.type]; x0 = Math.min(x0, d.x + (df.ox ?? 0)); y0 = Math.min(y0, d.y); x1 = Math.max(x1, d.x + df.w); y1 = Math.max(y1, d.y + df.h); }
    const pad = 24, padR = 72;   // extra room on the right so the zoom buttons never cover a part
    const k = clamp(Math.min((size.w - pad - padR) / (x1 - x0), (size.h - 2 * pad) / (y1 - y0)), MIN_K, 1.4);
    setView({ k, x: pad + (size.w - pad - padR - (x1 - x0) * k) / 2 - x0 * k, y: (size.h - (y1 - y0) * k) / 2 - y0 * k });
  }, [devices, size]);
  useEffect(() => { if (needFit.current && size.w) { needFit.current = false; fit(); } }, [size, devices, fit]);

  /** Double-tap a part = zoom so that the part fills the canvas (easy way to reach tiny pins on a phone). */
  const lastTap = useRef({ id: null, t: 0, x: 0, y: 0 });
  const focusDevice = (d) => {
    const df = DEVICES[d.type], pad = 40, padR = 72;            // padR keeps the zoom buttons clear
    const x0 = d.x + (df.ox ?? 0) - pad, y0 = d.y - pad, w = df.w - (df.ox ?? 0) + 2 * pad, h = df.h + 2 * pad;
    const k = clamp(Math.min((size.w - padR) / w, size.h / h), MIN_K, MAX_K);
    setView({ k, x: (size.w - padR - w * k) / 2 - x0 * k, y: (size.h - h * k) / 2 - y0 * k });
  };

  /** Zoom by factor f keeping the screen point (cx, cy) fixed. */
  const zoomAt = (cx, cy, f) => setView((v) => { const k = clamp(v.k * f, MIN_K, MAX_K), r = k / v.k; return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }; });

  // Mouse wheel / trackpad zoom. Needs a native listener: React's onWheel is passive and cannot preventDefault.
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const h = (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [cfg]);

  // Delete / Backspace removes the selected wire or device (not while typing in the editor).
  useEffect(() => {
    const h = (e) => {
      if (!["Delete", "Backspace"].includes(e.key) || /TEXTAREA|INPUT|SELECT/.test(e.target.tagName)) return;
      if (selWire) { setWires((ws) => ws.filter((w) => w.id !== selWire.id)); setSelWire(null); }
      else if (selected) removeSelected();
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  // ================= CANVAS: pointer handling =================
  const toWorld = (e) => { const r = svgRef.current.getBoundingClientRect(), v = viewRef.current; return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k }; };
  const startPinch = () => {
    const [p1, p2] = [...ptrs.current.values()], r = svgRef.current.getBoundingClientRect();
    gesture.current = { d0: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, mid0: { x: (p1.x + p2.x) / 2 - r.left, y: (p1.y + p2.y) / 2 - r.top }, view0: viewRef.current };
  };
  const pinchMove = () => {
    const g = gesture.current; if (!g) return;
    const [p1, p2] = [...ptrs.current.values()], r = svgRef.current.getBoundingClientRect();
    const k = clamp(g.view0.k * Math.hypot(p1.x - p2.x, p1.y - p2.y) / g.d0, MIN_K, MAX_K);
    const mx = (p1.x + p2.x) / 2 - r.left, my = (p1.y + p2.y) / 2 - r.top;
    const wx = (g.mid0.x - g.view0.x) / g.view0.k, wy = (g.mid0.y - g.view0.y) / g.view0.k;   // world point that was under the fingers
    setView({ k, x: mx - wx * k, y: my - wy * k });
  };
  /** Runs for EVERY pointer (capture phase), even when a child calls stopPropagation. */
  const onDownCapture = (e) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) { setDrag(null); setPending(null); setHdrag(null); setSnap(null); pan.current = null; startPinch(); }   // second finger = pinch, cancel anything else
  };
  /** Reached only when the touch started on empty canvas (children stop propagation): start panning. */
  const onBgDown = (e) => {
    if (ptrs.current.size > 1) return;
    setSelected(null); setSelWire(null);
    pan.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
  };
  const onMove = (e) => {
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size >= 2) { pinchMove(); return; }
    if (pan.current && pan.current.id === e.pointerId) { const s = pan.current; setView((v) => ({ ...v, x: s.vx + e.clientX - s.sx, y: s.vy + e.clientY - s.sy })); return; }
    const p = toWorld(e), reach = SNAP_PX / viewRef.current.k;           // magnet radius in world units
    if (drag) setDevices((ds) => ds.map((d) => (d.id === drag.id ? { ...d, x: Math.round(p.x - drag.ox), y: Math.round(p.y - drag.oy) } : d)));  // wires follow because they store pin IDs
    if (pending) { setSnap(nearestPin(devices, DEVICES, p, reach, pending.from)); setPending({ ...pending, x: p.x, y: p.y }); }
    if (hdrag?.type === "end") {
      const w = wires.find((x) => x.id === hdrag.id), other = w && (hdrag.end === "a" ? w.b : w.a);
      const s = nearestPin(devices, DEVICES, p, reach, other); setSnap(s);
      setHdrag({ ...hdrag, x: s ? s.x : p.x, y: s ? s.y : p.y });         // the end jumps onto the pin centre when close
    }
    if (hdrag?.type === "pt") setWires((ws) => ws.map((w) => (w.id === hdrag.id ? { ...w, pts: w.pts.map((q, i) => (i === hdrag.index ? { x: p.x, y: p.y } : q)) } : w)));
  };
  /** Pointer released (commit = true) or cancelled / left the canvas (commit = false). */
  const finish = (e, commit) => {
    ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) gesture.current = null;
    if (pan.current?.id === e.pointerId) pan.current = null;
    if (commit && pending && snap) setWires((ws) => [...ws, { id: `w${Date.now()}`, a: pending.from, b: { dev: snap.dev, pin: snap.pin }, color: wireColor, pts: [] }]);   // snapped = connected
    if (commit && hdrag?.type === "end" && snap) setWires((ws) => ws.map((w) => (w.id === hdrag.id ? { ...w, [hdrag.end]: { dev: snap.dev, pin: snap.pin } } : w)));  // end moved to another pin
    setPending(null); setHdrag(null); setSnap(null); setDrag(null);
    setResetDown(false); setSim((s) => (s.button ? { ...s, button: false } : s));
  };

  const startWire = (e, dev, pin) => { e.stopPropagation(); if (ptrs.current.size > 1) return; const p = pinPos(devices, { dev, pin }); setSelWire(null); setPending({ from: { dev, pin }, x: p.x, y: p.y }); };
  const selectWire = (e, w) => { e.stopPropagation(); if (ptrs.current.size > 1) return; const r = stageRef.current.getBoundingClientRect(); setSelWire({ id: w.id, sx: e.clientX - r.left, sy: e.clientY - r.top }); setSelected(null); };
  const startEnd = (e, w, end) => { e.stopPropagation(); if (ptrs.current.size > 1) return; const q = pinPos(devices, w[end]); setHdrag({ type: "end", id: w.id, end, x: q.x, y: q.y }); };
  const startPt = (e, w, index) => { e.stopPropagation(); if (ptrs.current.size > 1) return; setHdrag({ type: "pt", id: w.id, index }); };
  const startBend = (e, w, m) => {   // dragging a "+" handle inserts a new bend point at that spot
    e.stopPropagation(); if (ptrs.current.size > 1) return;
    setWires((ws) => ws.map((x) => (x.id === w.id ? { ...x, pts: [...x.pts.slice(0, m.index), { x: m.x, y: m.y }, ...x.pts.slice(m.index)] } : x)));
    setHdrag({ type: "pt", id: w.id, index: m.index });
  };
  const patchWire = (id, patch) => setWires((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const addDevice = (type) => { const n = devices.filter((d) => d.type === type).length, v = viewRef.current; setDevices((d) => [...d, { id: `${type}${n + 1}_${Date.now() % 1000}`, type, x: Math.round((size.w * 0.15 - v.x) / v.k + 30 * n), y: Math.round((size.h * 0.6 - v.y) / v.k) }]); setMenu(false); };  // appears inside the visible area
  const removeSelected = () => { if (!selected) return; setDevices((d) => d.filter((x) => x.id !== selected)); setWires((w) => w.filter((x) => x.a.dev !== selected && x.b.dev !== selected)); setSelected(null); };

  /** Is this device "active"? (LED lit / pump running / fan running) from the wired Arduino pin. */
  const isOn = (d) => { const def = DEVICES[d.type]; return def.role && bindings[def.role] !== undefined && outputs[bindings[def.role]] === 1; };

  if (!cfg) return <p style={{ padding: 20 }}>{online ? "Loading..." : "Backend offline. Start it with: uvicorn main:app --reload --port 8000"}</p>;
  const inst = cfg.institution;
  const inv = 1 / view.k;                                           // 1 screen pixel in world units
  const sw = selWire && wires.find((w) => w.id === selWire.id);     // wire currently being edited
  /** End point of a wire; the end being dragged follows the finger. */
  const endPos = (w, end) => (hdrag?.type === "end" && hdrag.id === w.id && hdrag.end === end ? { x: hdrag.x, y: hdrag.y } : pinPos(devices, w[end]));
  const PW = Math.min(300, Math.max(160, size.w - 16));
  const popStyle = sw && { width: PW, left: clamp(selWire.sx - PW / 2, 8, Math.max(8, size.w - PW - 8)), ...(selWire.sy > size.h * 0.45 ? { bottom: size.h - selWire.sy + 18 } : { top: selWire.sy + 26 }) };
  const handleR = (COARSE ? 13 : 10) * inv;

  return (
    <>
      <header>
        <img className="logo" src="/sua-logo.png" alt="SUA logo" onError={(e) => (e.currentTarget.style.display = "none")} /><h1>{inst.name}</h1><small>{inst.lab}</small>
        <span className="sp" />
        <select aria-label="Scenario" onChange={(e) => loadScenario(cfg.scenarios.find((s) => s.id === e.target.value))}>
          {cfg.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span title="Backend connection">{online ? "Backend connected" : "Backend offline"}</span>
        <button className="primary" onClick={() => { if (!running) setPowered(true); setRunning(!running); }}>{running ? <Pause size={16} /> : <Play size={16} />}{running ? "Pause" : "Start simulation"}</button>
        <button onClick={tick}><StepForward size={16} />Step</button>
        <button onClick={reset}><RotateCcw size={16} />Reset</button>
      </header>

      <main>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <section>
            <h2>Arduino code <span className="sp" /><button onClick={validate}><CheckCircle2 size={14} />Validate</button></h2>
            <textarea className="code" spellCheck={false} value={code} onChange={(e) => { setCode(e.target.value); needReset.current = true; }} aria-label="Arduino C++ code" />
            {error && <div className="err" role="alert">{error}</div>}
          </section>
          <section>
            <h2>Serial monitor <span className="sp" /><button onClick={() => setSerial([])}><Eraser size={14} />Clear</button></h2>
            <pre className="serial" ref={(el) => el && (el.scrollTop = el.scrollHeight)}>{serial.join("\n") || "Waiting for Serial output..."}</pre>
          </section>
        </div>

        <div className="col-circuit" style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <section>
            <h2>Circuit</h2>
            <div className="toolbar">
              <button className="primary" onClick={() => setMenu(!menu)} aria-label="Add component"><Plus size={16} />Add</button>
              {menu && <div className="menu">{Object.entries(DEVICES).filter(([k]) => k !== "arduino").map(([k, d]) => <button key={k} onClick={() => addDevice(k)}>{d.label}</button>)}</div>}
              <label>New wire colour <select value={wireColor} onChange={(e) => setWireColor(e.target.value)}>{Object.entries(WIRE_COLORS).map(([n, c]) => <option key={n} value={c}>{n}</option>)}</select></label>
              <button onClick={removeSelected} disabled={!selected}><Trash2 size={14} />Delete selected</button>
              <small>Drag from a pin to another pin to wire (it snaps). Tap a wire to edit it. Pinch / wheel = zoom, drag empty space = pan, double-tap a part = zoom to it..</small>
            </div>
            <div className="stage" ref={stageRef}>
              <svg ref={svgRef} onPointerDownCapture={onDownCapture} onPointerDown={onBgDown} onPointerMove={onMove}
                   onPointerUp={(e) => finish(e, true)} onPointerCancel={(e) => finish(e, false)} onPointerLeave={(e) => e.pointerType === "mouse" && finish(e, false)}>
                {/* Dotted grid that moves and scales together with the view */}
                <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x} ${view.y}) scale(${view.k})`}><circle cx="1" cy="1" r="1" fill="#c3d6c9" /></pattern></defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
                  {/* 1) DEVICES */}
                  {[...devices].sort((p, q) => (DEVICES[p.type].layer ?? 1) - (DEVICES[q.type].layer ?? 1)).map((d) => { const def = DEVICES[d.type];   // breadboard (layer 0) is drawn first = behind
                    return (
                      <g key={d.id} transform={`translate(${d.x},${d.y})`} style={{ cursor: "move" }}
                         onPointerDown={(e) => { e.stopPropagation();
                           if (ptrs.current.size > 1) return;
                           if (e.target.dataset.reset) { setResetDown(true); boardReset(); return; }   // Arduino RESET button
                           if (e.target.dataset.btn) { setSim((s) => ({ ...s, button: true })); return; }
                           const now = Date.now(), lt = lastTap.current;   // double-tap detection (same part, < 350 ms, finger moved < 14 px)
                           if (lt.id === d.id && now - lt.t < 350 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 14) { lastTap.current = { id: null, t: 0, x: 0, y: 0 }; focusDevice(d); return; }
                           lastTap.current = { id: d.id, t: now, x: e.clientX, y: e.clientY };
                           const p = toWorld(e); setSelected(d.id); setSelWire(null); setDrag({ id: d.id, ox: p.x - d.x, oy: p.y - d.y });
                         }}>
                        <def.Art on={isOn(d)} pressed={sim.button} board={board} />
                        {selected === d.id && <rect x={(def.ox ?? 0) - 4} y="-4" width={def.w - (def.ox ?? 0) + 8} height={def.h + 8} fill="none" stroke="#e0a400" strokeDasharray="5 3" />}
                      </g>); })}

                  {/* 2) WIRES - drawn ABOVE the devices so they never disappear under the board.
                         Each wire stores pin IDs, so its ends can never drift when parts move or the view zooms. */}
                  {wires.map((w) => { const a = endPos(w, "a"), b = endPos(w, "b"); if (!a || !b) return null;
                    const g = wireGeometry(a, b, w.pts), on = selWire?.id === w.id;
                    return (
                      <g key={w.id}>
                        <path className="wire-hit" d={g.d} strokeWidth={clamp(22 * inv, 12, 40)} onPointerDown={(e) => selectWire(e, w)} />
                        <path className="wire-core" d={g.d} stroke="#000" strokeOpacity={on ? 0.6 : 0.4} strokeWidth={on ? 7.5 : 6} />
                        <path className="wire-core" d={g.d} stroke={w.color} strokeWidth="4" />
                        <path className="wire-core" d={g.d} stroke="#fff" strokeOpacity="0.3" strokeWidth="1.2" transform="translate(-0.8,-0.8)" />
                        {[a, b].map((q, i) => <g key={i} pointerEvents="none"><circle cx={q.x} cy={q.y} r="4.6" fill={w.color} stroke="#000" strokeOpacity="0.5" /><circle cx={q.x} cy={q.y} r="2" fill="#d9dde0" /></g>)}
                      </g>); })}

                  {/* 3) PIN TOUCH TARGETS - above the wires so you can always start a new wire from a pin.
                         Radius grows when zoomed out but never overlaps the neighbouring pin (p.near). */}
                  {devices.map((d) => DEVICES[d.type].pins.map((p) =>
                    <circle key={`${d.id}.${p.id}`} className="pin" cx={d.x + p.dx} cy={d.y + p.dy} r={Math.min(p.near ?? 8, Math.max(8, 20 * inv))} fill="transparent"
                      onPointerEnter={() => setHover({ x: d.x + p.dx, y: d.y + p.dy, text: p.name ?? p.id })} onPointerLeave={() => setHover(null)}
                      onPointerDown={(e) => startWire(e, d.id, p.id)} />))}

                  {/* 4) HANDLES of the selected wire: circles at the ends (move to another pin), "+" in the middle of each segment (bend), dots on bends */}
                  {sw && (() => { const a = endPos(sw, "a"), b = endPos(sw, "b"); if (!a || !b) return null; const g = wireGeometry(a, b, sw.pts);
                    return (<g>
                      {g.mids.map((m) => <g key={`m${m.index}`} className="h-mid" onPointerDown={(e) => startBend(e, sw, m)}><circle cx={m.x} cy={m.y} r={handleR * 0.85} /><path d={`M${m.x - handleR * 0.4},${m.y} h${handleR * 0.8} M${m.x},${m.y - handleR * 0.4} v${handleR * 0.8}`} /></g>)}
                      {sw.pts.map((q, i) => <circle key={`p${i}`} className="h-pt" cx={q.x} cy={q.y} r={handleR * 0.9} onPointerDown={(e) => startPt(e, sw, i)} onDoubleClick={() => patchWire(sw.id, { pts: sw.pts.filter((_, j) => j !== i) })} />)}
                      {["a", "b"].map((end) => { const q = end === "a" ? a : b; return <circle key={end} className="h-end" cx={q.x} cy={q.y} r={handleR} onPointerDown={(e) => startEnd(e, sw, end)} />; })}
                    </g>); })()}

                  {/* 5) Pin highlight + name tooltip; while dragging a wire it shows the pin it will snap to */}
                  {snap ? <Tip x={snap.x} y={snap.y} text={snap.name} inv={inv} /> : (hover && !drag && !pending && !hdrag && <Tip x={hover.x} y={hover.y} text={hover.text} inv={inv} />)}
                  {pending && (() => { const a = pinPos(devices, pending.from), e = snap || pending; return a && <line x1={a.x} y1={a.y} x2={e.x} y2={e.y} stroke={wireColor} strokeWidth="4" strokeLinecap="round" strokeDasharray="6 5" pointerEvents="none" />; })()}
                </g>
              </svg>
              <ZoomControls k={view.k} onIn={() => zoomAt(size.w / 2, size.h / 2, 1.3)} onOut={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.3)} onReset={fit} />
              {sw && <WirePopover wire={sw} colors={WIRE_COLORS} style={popStyle}
                onColor={(c) => patchWire(sw.id, { color: c })} onStraighten={() => patchWire(sw.id, { pts: [] })}
                onDelete={() => { setWires((ws) => ws.filter((w) => w.id !== sw.id)); setSelWire(null); }} onClose={() => setSelWire(null)} />}
            </div>
            <div className="map">Pin map: {Object.keys(bindings).length ? Object.entries(bindings).map(([r, p]) => `${r} -> ${p >= 14 ? "A" + (p - 14) : "D" + p}`).join("  |  ") : "no signal wires connected yet"}</div>
          </section>

          <section>
            <h2>Farm conditions</h2>
            <div className="controls">
              <label>Soil moisture: {sim.soil_moisture}%<input type="range" min="0" max="100" step="0.5" value={sim.soil_moisture} onChange={(e) => setSim({ ...sim, soil_moisture: +e.target.value })} /></label>
              <label>Temperature: {sim.temperature} C<input type="range" min="5" max="50" step="0.5" value={sim.temperature} onChange={(e) => setSim({ ...sim, temperature: +e.target.value })} /></label>
              <label>Ambient: {sim.ambient} C<input type="range" min="5" max="50" step="0.5" value={sim.ambient} onChange={(e) => setSim({ ...sim, ambient: +e.target.value })} /></label>
              <label>Button: {sim.button ? "PRESSED" : "RELEASED"}<button onClick={() => setSim({ ...sim, button: !sim.button })}>Toggle button</button></label>
              <label>Crop preset<select defaultValue="" onChange={(e) => e.target.value && applyCrop(e.target.value)}><option value="">Choose a crop...</option>{cfg.crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
