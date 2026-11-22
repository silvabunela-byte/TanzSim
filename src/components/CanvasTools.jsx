/**
 * CanvasTools.jsx - the two small HTML overlays that sit on top of the circuit canvas:
 *   ZoomControls : + / - / Reset view buttons (and the zoom percentage)
 *   WirePopover  : floating toolbar shown when a wire is tapped (colour, straighten, delete)
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Minus, Maximize2, Trash2, X, CircuitBoard, Sprout, Code2, Terminal } from "lucide-react";
export function ZoomControls({ k, onIn, onOut, onReset }) {
  return (
    <div className="zoom">
      <button aria-label="Zoom in" title="Zoom in" onClick={onIn}><Plus size={20} /></button>
      <button aria-label="Zoom out" title="Zoom out" onClick={onOut}><Minus size={20} /></button>
      <button aria-label="Reset view" title="Reset view" onClick={onReset}><Maximize2 size={18} /></button>
      <span className="zl">{Math.round(k * 100)}%</span>
    </div>
  );
}

export function WirePopover({ wire, colors, style, onColor, onStraighten, onDelete, onClose }) {
  return (
    <div className="wire-pop" style={style} role="dialog" aria-label="Wire options" onPointerDown={(e) => e.stopPropagation()}>
      <div className="row">
        <b style={{ flex: 1 }}>Wire</b>
        <button className="icon" aria-label="Close" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="row">
        {Object.entries(colors).map(([name, c]) => (
          <button key={name} className={"swatch" + (wire.color === c ? " on" : "")} style={{ background: c }}
                  aria-label={`Colour ${name}`} title={name} onClick={() => onColor(c)} />
        ))}
      </div>
      <div className="row">
        <button onClick={onStraighten} disabled={!wire.pts?.length}>Straighten</button>
        <button className="danger" onClick={onDelete}><Trash2 size={14} />Delete</button>
      </div>
      <small>Drag a circle: ends = move to another pin, middle = bend the wire.</small>
    </div>
  );
}


/**
 * ScrollRail - a wide scroll handle fixed to the right edge of the screen (phones/touch only, see styles.css).
 * Why: the circuit canvas uses touch for dragging parts and zooming, so a finger on it cannot scroll the page.
 * The rail lives OUTSIDE the canvas, so it always works:
 *   - drag the green handle  -> the page scrolls with it
 *   - tap anywhere on the rail -> jump there (handle centres on the finger)
 * It mirrors the browser's own scroll position, so it also moves when the user scrolls by other means.
 */
export function ScrollRail() {
  const rail = useRef(null);
  const drag = useRef(null);                                  // { grab }: finger offset inside the handle while dragging
  const [m, setM] = useState({ top: 0, h: 0, show: false });  // handle position and length in px

  /** Recompute handle size/position from the page height and scroll position. */
  const measure = useCallback(() => {
    const el = rail.current; if (!el) return;
    const track = el.clientHeight, view = window.innerHeight, total = document.documentElement.scrollHeight, max = total - view;
    if (!track || max <= 4) { setM((s) => (s.show ? { top: 0, h: 0, show: false } : s)); return; }   // page fits on screen: no rail needed
    const h = Math.max(56, (view / total) * track);           // handle length ~ visible fraction, never smaller than a finger (56px)
    setM({ top: (window.scrollY / max) * (track - h), h, show: true });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure); ro.observe(document.body);   // page height changes (serial lines, new parts)
    return () => { window.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); ro.disconnect(); };
  }, [measure]);

  /** Finger position -> page scroll position. `grab` keeps the handle under the finger. */
  const scrollTo = (clientY, grab) => {
    const r = rail.current.getBoundingClientRect(), max = document.documentElement.scrollHeight - window.innerHeight;
    const frac = (clientY - r.top - grab) / Math.max(1, r.height - m.h);
    window.scrollTo(0, Math.max(0, Math.min(1, frac)) * max);
  };
  const down = (e) => {
    e.preventDefault(); rail.current.setPointerCapture(e.pointerId);           // keep receiving moves even if the finger leaves the rail
    const y = e.clientY - rail.current.getBoundingClientRect().top;
    drag.current = { grab: y >= m.top && y <= m.top + m.h ? y - m.top : m.h / 2 };   // on the handle, or tapped the track
    scrollTo(e.clientY, drag.current.grab);
  };
  const move = (e) => { if (drag.current) scrollTo(e.clientY, drag.current.grab); };
  const up = () => { drag.current = null; };

  return (
    <div ref={rail} className="scroll-rail" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {m.show && <div className="scroll-thumb" style={{ transform: `translateY(${m.top}px)`, height: m.h }}><i /><i /><i /></div>}
    </div>
  );
}

/** [section id, label, icon] in the same order the sections appear on a phone (circuit first). */
const JUMPS = [["sec-circuit", "Circuit", CircuitBoard], ["sec-farm", "Farm", Sprout], ["sec-code", "Code", Code2], ["sec-serial", "Serial", Terminal]];

/** JumpBar - bottom navigation for phones: one tap scrolls smoothly to a section (see the ids in App.jsx). */
export function JumpBar() {
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <nav className="jumpbar" aria-label="Jump to section">
      {JUMPS.map(([id, label, Icon]) => <button key={id} onClick={() => go(id)}><Icon size={20} /><span>{label}</span></button>)}
    </nav>
  );
}
