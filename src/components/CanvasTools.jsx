/**
 * CanvasTools.jsx - the two small HTML overlays that sit on top of the circuit canvas:
 *   ZoomControls : + / - / Reset view buttons (and the zoom percentage)
 *   WirePopover  : floating toolbar shown when a wire is tapped (colour, straighten, delete)
 */
import React from "react";
import { Plus, Minus, Maximize2, Trash2, X } from "lucide-react";

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
