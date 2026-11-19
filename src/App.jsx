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

const WIRE_COLORS = { Red: "#d62828", Black: "#111111", Green: "#1b6b3a", Blue: "#2e7dd7", Yellow: "#e0a400" };
const SESSION = Math.random().toString(36).slice(2);  // one sketch memory per browser tab
const api = (path, body) => fetch(`/api/${path}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined).then((r) => r.json());

/** Convert 'D8' -> 8, 'A0' -> 14, power pins -> null (Arduino numbering). */
const pinNumber = (id) => (/^D\d+$/.test(id) ? +id.slice(1) : /^A\d$/.test(id) ? 14 + +id.slice(1) : null);

/** Absolute SVG position of a pin = device position + the anchor from the registry. */
const pinPos = (devices, ref) => {
  const d = devices.find((x) => x.id === ref.dev);
  const p = d && DEVICES[d.type].pins.find((q) => q.id === ref.pin);
  return d && p ? { x: d.x + p.dx, y: d.y + p.dy } : null;
};
/** Turn a status LED on for a moment (used for the TX/RX LEDs). `set` is a React state setter. */
const pulse = (set) => { set(true); setTimeout(() => set(false), 350); };
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
  const [wireColor, setWireColor] = useState("#1b6b3a");
  const [selected, setSelected] = useState(null);     // selected device id (for Delete)
  const [drag, setDrag] = useState(null);             // { id, ox, oy } while moving a device
  const [pending, setPending] = useState(null);       // { from, x, y } while dragging a new wire
    const [powered, setPowered] = useState(false);    // board power LED: true once the simulation has started
  const [tx, setTx] = useState(false);                // TX LED pulse (Serial output)
  const [rx, setRx] = useState(false);                // RX LED pulse (reset / validate = "host talks to board")
  const [resetDown, setResetDown] = useState(false);  // RESET button looks pressed
  const [hover, setHover] = useState(null);           // pin under the mouse: { x, y, text }
  const svgRef = useRef(null);
  const latest = useRef({}); const busy = useRef(false); const sketchRef = useRef(null); const needReset = useRef(true);  // sketchRef = sketch memory returned by the server

  // ---- load institution config (branding, crops, scenarios) once ----
  useEffect(() => {
    api("config").then((c) => {
      setCfg(c); setOnline(true);
      const t = c.institution.theme, r = document.documentElement.style;  // applyTheme
      r.setProperty("--green", t.green); r.setProperty("--green-soft", t.green_soft); r.setProperty("--gold", t.gold); r.setProperty("--ink", t.ink);
      loadScenario(c.scenarios[0]);
    }).catch(() => setOnline(false));
  }, []);

  const loadScenario = (s) => {
    setDevices(s.devices.map((d) => ({ ...d })));
    setWires(s.wires.map(([da, pa, db, pb, color], i) => ({ id: `w${i}`, a: { dev: da, pin: pa }, b: { dev: db, pin: pb }, color })));
    setCode(s.code); setSerial([]); setError(""); setRunning(false); needReset.current = true;
        setPowered(false); sketchRef.current = null;   // a freshly loaded scenario starts "unplugged"
  };

  // ---- AUTOMATIC PIN MAPPING: which Arduino pin is each device's signal wire attached to? ----
  const bindings = useMemo(() => {
    const out = {};
    for (const d of devices) {
      const def = DEVICES[d.type];
      if (!def.role || out[def.role] !== undefined) continue;   // first device of a role wins
      const w = wires.find((w) => (w.a.dev === d.id && w.a.pin === def.sig) || (w.b.dev === d.id && w.b.pin === def.sig));
      if (!w) continue;
      const other = w.a.dev === d.id && w.a.pin === def.sig ? w.b : w.a;
      const od = devices.find((x) => x.id === other.dev);
      if (od?.type === "arduino" && pinNumber(other.pin) !== null) out[def.role] = pinNumber(other.pin);
    }
    return out;
  }, [devices, wires]);

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

  // ---- CANVAS: pointer helpers ----
  const toSvg = (e) => { const p = svgRef.current.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svgRef.current.getScreenCTM().inverse()); };
  const onMove = (e) => {
    const p = toSvg(e);
    if (drag) setDevices((ds) => ds.map((d) => (d.id === drag.id ? { ...d, x: Math.round(p.x - drag.ox), y: Math.round(p.y - drag.oy) } : d)));  // wires redraw automatically
    if (pending) setPending({ ...pending, x: p.x, y: p.y });
  };
  const endPointer = () => { setResetDown(false); setDrag(null); setPending(null); setSim((s) => (s.button ? { ...s, button: false } : s)); };
  const startWire = (e, dev, pin) => { e.stopPropagation(); const p = pinPos(devices, { dev, pin }); setPending({ from: { dev, pin }, x: p.x, y: p.y }); };
  const endWire = (e, dev, pin) => {
    e.stopPropagation();
    if (pending && !(pending.from.dev === dev && pending.from.pin === pin)) setWires((w) => [...w, { id: `w${Date.now()}`, a: pending.from, b: { dev, pin }, color: wireColor }]);
    setPending(null);
  };
  const addDevice = (type) => { const n = devices.filter((d) => d.type === type).length; setDevices((d) => [...d, { id: `${type}${n + 1}_${Date.now() % 1000}`, type, x: 60 + 30 * n, y: 380 }]); setMenu(false); };
  const removeSelected = () => { if (!selected) return; setDevices((d) => d.filter((x) => x.id !== selected)); setWires((w) => w.filter((x) => x.a.dev !== selected && x.b.dev !== selected)); setSelected(null); };

  /** Is this device "active"? (LED lit / pump running / fan running) from the wired Arduino pin. */
  const isOn = (d) => { const def = DEVICES[d.type]; return def.role && bindings[def.role] !== undefined && outputs[bindings[def.role]] === 1; };

  if (!cfg) return <p style={{ padding: 20 }}>{online ? "Loading..." : "Backend offline. Start it with: uvicorn main:app --reload --port 8000"}</p>;
  const inst = cfg.institution;

  return (
    <>
      <header>
        <h1>{inst.name}</h1><small>{inst.lab}</small>
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

        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <section>
            <h2>Circuit</h2>
            <div className="toolbar">
              <button className="primary" onClick={() => setMenu(!menu)} aria-label="Add component"><Plus size={16} />Add</button>
              {menu && <div className="menu">{Object.entries(DEVICES).filter(([k]) => k !== "arduino").map(([k, d]) => <button key={k} onClick={() => addDevice(k)}>{d.label}</button>)}</div>}
              <label>Wire colour <select value={wireColor} onChange={(e) => setWireColor(e.target.value)}>{Object.entries(WIRE_COLORS).map(([n, c]) => <option key={n} value={c}>{n}</option>)}</select></label>
              <button onClick={removeSelected} disabled={!selected}><Trash2 size={14} />Delete selected</button>
              <small>Drag from a pin to another pin to wire. Click a wire to remove it.</small>
            </div>
            <div className="stage">
              <svg ref={svgRef} viewBox="0 0 800 560" onPointerMove={onMove} onPointerUp={endPointer} onPointerLeave={endPointer} onPointerDown={() => setSelected(null)}>
                {/* WIRES are drawn first so devices sit above them; endpoints are recomputed every render */}
                {wires.map((w) => { const a = pinPos(devices, w.a), b = pinPos(devices, w.b); if (!a || !b) return null;
                  const my = Math.max(a.y, b.y) + 40;
                  return <path key={w.id} className="wire" stroke={w.color} d={`M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`} onClick={() => setWires((ws) => ws.filter((x) => x.id !== w.id))}><title>Click to delete wire</title></path>; })}
                {devices.map((d) => { const def = DEVICES[d.type];
                  return (
                    <g key={d.id} transform={`translate(${d.x},${d.y})`} style={{ cursor: "move" }}
                       onPointerDown={(e) => { e.stopPropagation(); 
                            if (e.target.dataset.reset) { setResetDown(true); boardReset(); return; }   // Arduino RESET button
                            if (e.target.dataset.btn) { setSim((s) => ({ ...s, button: true })); return; } 
                            const p = toSvg(e); setSelected(d.id); setDrag({ id: d.id, ox: p.x - d.x, oy: p.y - d.y }); 
                            }}>
                      <def.Art on={isOn(d)} pressed={sim.button} board={board} />
                      {def.pins.map((p) => <circle key={p.id} className="pin" cx={p.dx} cy={p.dy} r=r={p.hit ?? 8} fill="transparent" onPointerEnter={() => setHover({ x: d.x + p.dx, y: d.y + p.dy, text: p.name ?? p.id })} onPointerLeave={() => setHover(null)} fill="transparent" onPointerDown={(e) => startWire(e, d.id, p.id)} onPointerUp={(e) => endWire(e, d.id, p.id)}><title>{`${d.id}: ${p.id}`}</title></circle>)}
                      {selected === d.id && <rect x="-4" y="-4" width={def.w + 8} height={def.h + 8} fill="none" stroke="#e0a400" strokeDasharray="5 3" />}
                    </g>); })}
                {/* Pin highlight + name tooltip; also appears while dragging a wire so the student sees the target pin */}
{hover && <g pointerEvents="none"><circle cx={hover.x} cy={hover.y} r="10" fill="none" stroke="#e0a400" strokeWidth="2.5" />
  <rect x={hover.x - (hover.text.length * 3.4 + 6)} y={hover.y - 36} width={hover.text.length * 6.8 + 12} height="18" rx="4" fill="#1b6b3a" />
  <text x={hover.x} y={hover.y - 23} fontSize="11" fill="#fff" textAnchor="middle">{hover.text}</text></g>}
                {pending && (() => { const a = pinPos(devices, pending.from); return a && <line x1={a.x} y1={a.y} x2={pending.x} y2={pending.y} stroke={wireColor} strokeWidth="3" strokeDasharray="6 4" />; })()}
              </svg>
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
