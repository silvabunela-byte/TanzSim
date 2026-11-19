/**
 * registry.jsx - THE DEVICE CATALOGUE.
 *
 * Every part that can appear on the circuit canvas is described once here:
 *   label : name shown in the "+" menu
 *   w, h  : body size in SVG units
 *   pins  : [{ id, label, dx, dy }]  - pin anchors RELATIVE to the device's top-left.
 *           Wires attach to (x + dx, y + dy), so they follow the device while dragging.
 *   role  : which simulation quantity this device represents. The simulator finds the
 *           Arduino pin wired to the device's `sig` pin and sends it to the backend as a
 *           "binding" (e.g. pump -> D8). Roles: soil | temp | button | pump | fan | led.
 *   sig   : the pin id that carries the signal for that role.
 *   Art   : React component drawing the device. Props: { on, pressed }.
 *
 * HOW OTHER PROGRAMS ADD DEVICES (e.g. Electrical, Civil, Food Engineering):
 * copy one entry, change the pins and drawing, add a role handled in api/index.py.
 *
 * NOTE ON @wokwi/elements: Wokwi's web components can replace any `Art` below.
 * Our own SVGs are used here because their pin anchors are exact and the farm
 * sensors do not exist in Wokwi. To swap in a Wokwi part, render <wokwi-led/> inside
 * a <foreignObject> and copy its `pinInfo` coordinates into `pins`.
 */
import React from "react";

const ink = "#16241c";

// ---- Arduino Uno: digital header on top, power + analog header on the bottom ----
export const ARDUINO = { w: 260, h: 150 };
const arduinoPins = [
  ...Array.from({ length: 14 }, (_, i) => ({ id: `D${13 - i}`, label: `${13 - i}`, dx: 14 + i * 17, dy: 0 })),
  ...["5V", "3V3", "GND", "A0", "A1", "A2", "A3", "A4", "A5"].map((id, i) => ({ id, label: id, dx: 20 + i * 27, dy: 150 })),
];

const Pin = ({ p, color = "#c9a227" }) => <circle cx={p.dx} cy={p.dy} r="4" fill={color} stroke={ink} strokeWidth="1" />;

function UnoArt() {
  return (
    <g>
      <rect width="260" height="150" rx="8" fill="#00797d" stroke={ink} />
      <rect x="-12" y="40" width="40" height="34" fill="#c0c4c8" stroke={ink} />{/* USB */}
      <rect x="95" y="55" width="70" height="30" rx="3" fill="#222" />{/* MCU */}
      <text x="130" y="74" fill="#ddd" fontSize="10" textAnchor="middle">ATmega328P</text>
      <text x="130" y="115" fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle">ARDUINO UNO</text>
      {arduinoPins.map((p) => (
        <g key={p.id}>
          <Pin p={p} />
          <text x={p.dx} y={p.dy === 0 ? 16 : 138} fontSize="8" fill="#fff" textAnchor="middle">{p.label}</text>
        </g>
      ))}
    </g>
  );
}

// ---- Small helper so simple modules share one look ----
const Module = ({ w, h, fill, title, children }) => (
  <g>
    <rect width={w} height={h} rx="6" fill={fill} stroke={ink} />
    <text x={w / 2} y="13" fontSize="9" fill="#fff" textAnchor="middle" fontWeight="600">{title}</text>
    {children}
  </g>
);
const bottomPins = (ids, w, y) => ids.map((id, i) => ({ id, label: id, dx: (w / (ids.length + 1)) * (i + 1), dy: y }));
const PinLabels = ({ pins }) => pins.map((p) => (
  <g key={p.id}><Pin p={p} /><text x={p.dx} y={p.dy - 7} fontSize="7" fill="#fff" textAnchor="middle">{p.label}</text></g>
));

function SoilArt({ pins }) {
  return (<Module w={90} h={110} fill="#6b4a2b" title="Soil Moisture">
    <rect x="30" y="20" width="12" height="55" fill="#d7d7d7" stroke={ink} /><rect x="50" y="20" width="12" height="55" fill="#d7d7d7" stroke={ink} />
    <PinLabels pins={pins} /></Module>);
}
function TempArt({ pins }) {
  return (<Module w={90} h={90} fill="#2e5d8c" title="Temp Sensor">
    <circle cx="45" cy="38" r="14" fill="#e8eef5" stroke={ink} /><PinLabels pins={pins} /></Module>);
}
function PumpArt({ pins, on }) {
  return (<Module w={90} h={90} fill={on ? "#1b8a4a" : "#4d5b53"} title={on ? "Pump ON" : "Pump OFF"}>
    <circle cx="45" cy="40" r="16" fill="#cfd8d2" stroke={ink} />
    <path d="M45 28 L45 52 M33 40 L57 40" stroke={ink} strokeWidth="3" className={on ? "spin" : ""} style={{ transformOrigin: "45px 40px" }} />
    <PinLabels pins={pins} /></Module>);
}
function FanArt({ pins, on }) {
  return (<Module w={90} h={90} fill={on ? "#2a7f9e" : "#4d5b53"} title={on ? "Fan ON" : "Fan OFF"}>
    <g className={on ? "spin" : ""} style={{ transformOrigin: "45px 40px" }}>
      {[0, 120, 240].map((a) => <ellipse key={a} cx="45" cy="26" rx="6" ry="13" fill="#e8eef5" stroke={ink} transform={`rotate(${a} 45 40)`} />)}
    </g><PinLabels pins={pins} /></Module>);
}
function LedArt({ pins, on }) {
  return (<g>
    {on && <circle cx="20" cy="18" r="22" fill="#ff3b30" opacity="0.35" />}
    <circle cx="20" cy="18" r="13" fill={on ? "#ff3b30" : "#8a2b27"} stroke={ink} />
    <rect x="0" y="28" width="40" height="22" rx="3" fill="#ddd" stroke={ink} />
    <PinLabels pins={pins} /></g>);
}
function ButtonArt({ pins, pressed }) {
  return (<g>
    <rect width="50" height="50" rx="5" fill="#d9d9d9" stroke={ink} />
    <circle data-btn="1" cx="25" cy="20" r="13" fill={pressed ? "#9b1c1c" : "#d62828"} stroke={ink} style={{ cursor: "pointer" }} />
    <PinLabels pins={pins} /></g>);
}

const mk = (label, w, h, ids, py, role, sig, Art) => {
  const pins = bottomPins(ids, w, py);
  return { label, w, h, pins, role, sig, Art: (props) => <Art pins={pins} {...props} /> };
};

export const DEVICES = {
  arduino: { label: "Arduino Uno", w: ARDUINO.w, h: ARDUINO.h, pins: arduinoPins, Art: UnoArt },
  soil: mk("Soil Moisture Sensor", 90, 110, ["VCC", "SIG", "GND"], 110, "soil", "SIG", SoilArt),
  temp: mk("Temperature Sensor", 90, 90, ["VCC", "SIG", "GND"], 90, "temp", "SIG", TempArt),
  pump: mk("Water Pump / Valve", 90, 90, ["SIG", "GND"], 90, "pump", "SIG", PumpArt),
  fan: mk("Greenhouse Fan", 90, 90, ["SIG", "GND"], 90, "fan", "SIG", FanArt),
  led: { label: "LED", w: 40, h: 50, role: "led", sig: "ANODE", pins: [{ id: "ANODE", label: "A", dx: 25, dy: 50 }, { id: "CATHODE", label: "K", dx: 15, dy: 50 }], Art: (p) => <LedArt pins={DEVICES.led.pins} {...p} /> },
  button: mk("Push Button", 50, 50, ["SIG", "GND"], 50, "button", "SIG", ButtonArt),
};
