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

// ---- Arduino Uno R3 ----------------------------------------------------------
// SINGLE SOURCE OF TRUTH FOR PIN POSITIONS: every hole drawn below, every hit circle in
// App.jsx, every snap target and every wire end point is computed from `arduinoPins`.
// dx/dy = centre of the hole, relative to the board's top-left corner.
export const ARDUINO = { w: 330, h: 250 };   // taller than before: closer to the real 68.6 x 53.3 mm shape
const TOP = 8;                    // y of the top header holes
const BOT = ARDUINO.h - 8;        // y of the bottom header holes
const PWM = new Set([3, 5, 6, 9, 10, 11]);

// id: used by wires and the pin map | label: silkscreen text | name: tooltip text
// hit: max radius of the invisible touch target
const mkPin = (id, label, dx, dy, hit, name = id) => ({ id, label, name, dx, dy, hit });

const arduinoPins = [
  mkPin("GND2", "GND", 32, TOP, 8, "GND"),
  // Digital header like the real Uno: 13..8 | gap | 7..0   (~ marks PWM pins)
  ...[13, 12, 11, 10, 9, 8].map((n, i) => mkPin(`D${n}`, PWM.has(n) ? `~${n}` : `${n}`, 62 + i * 17, TOP, 8, `D${n}${PWM.has(n) ? " (PWM)" : ""}`)),
  ...[7, 6, 5, 4, 3, 2, 1, 0].map((n, i) => mkPin(`D${n}`, PWM.has(n) ? `~${n}` : `${n}`, 178 + i * 17, TOP, 8, `D${n}${PWM.has(n) ? " (PWM)" : ""}`)),
  // Power header (RESET 3.3V 5V GND GND VIN) and analog header (A0..A5), pitch 20
  mkPin("RESET", "RST", 70, BOT, 9, "RESET"), mkPin("3V3", "3.3V", 90, BOT, 9, "3.3V"), mkPin("5V", "5V", 110, BOT, 9),
  mkPin("GND", "GND", 130, BOT, 9), mkPin("GND3", "GND", 150, BOT, 9, "GND"), mkPin("VIN", "VIN", 170, BOT, 9),
  ...[0, 1, 2, 3, 4, 5].map((i) => mkPin(`A${i}`, `A${i}`, 200 + i * 20, BOT, 9, `A${i} (D${14 + i})`)),
];

const Pin = ({ p, color = "#c9a227" }) => <circle cx={p.dx} cy={p.dy} r="4" fill={color} stroke={ink} strokeWidth="1" />;

/** One socket of a female header: black square hole with a gold contact inside. */
const Hole = ({ x, y }) => (
  <g>
    <rect x={x - 4.5} y={y - 4.5} width="9" height="9" rx="1.2" fill="#050505" stroke="#2c2c2c" strokeWidth="0.8" />
    <circle cx={x} cy={y} r="2.1" fill="#0d0d0d" stroke="#b08d2e" strokeWidth="0.9" />
  </g>
);

/** Small SMD status LED (ON / L / TX / RX) with a soft glow when lit. */
const Smd = ({ x, y, on, color, text }) => (
  <g>
    {on && <circle cx={x + 4} cy={y + 2.2} r="10" fill={color} opacity="0.45" />}
    <rect x={x} y={y} width="8" height="4.5" rx="1" fill={on ? color : "#d9d6a3"} stroke="#4a4f2a" strokeWidth="0.6" />
    <text x={x + 12} y={y + 4.5} fontSize="6" fill="#fff" fontWeight="700">{text}</text>
  </g>
);

const silk = { fill: "#fff", fontFamily: "Arial, Helvetica, sans-serif" };   // white silkscreen text
const passives = [[108,160,7,4],[108,168,7,4],[118,150,4,7],[122,178,7,4],[130,186,7,4],[136,150,7,4],[116,202,7,4],[128,208,7,4],[140,200,4,7],[152,190,7,4],[160,206,7,4],[100,132,4,7]];

/**
 * Arduino Uno R3 drawing. `board` is supplied by App.jsx:
 *   powered -> green ON LED     l13 -> amber "L" LED (pin 13 is HIGH)
 *   tx / rx -> serial activity  resetDown -> RESET button looks pressed
 * The RESET cap carries data-reset="1"; App.jsx listens for it and restarts the sketch.
 */
function UnoArt({ board = {} }) {
  const { powered = false, l13 = false, tx = false, rx = false, resetDown = false } = board;
  const W = ARDUINO.w, H = ARDUINO.h;
  const socket = (x, y, w) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height="16" rx="1.5" fill="#15191a" stroke="#000" strokeWidth="0.8" />;
  return (
    <g>
      <defs>
        <linearGradient id="unoPcb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0a8a91" /><stop offset="1" stopColor="#045a61" /></linearGradient>
        <linearGradient id="unoMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4f6f8" /><stop offset="0.5" stopColor="#b9c0c7" /><stop offset="1" stopColor="#8a929a" /></linearGradient>
        <radialGradient id="unoCap" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stopColor="#f4f4f4" /><stop offset="1" stopColor="#737b82" /></radialGradient>
      </defs>

      {/* PCB with soft shadow, inner silkscreen border and mounting holes */}
      <rect x="3" y="5" width={W} height={H} rx="10" fill="#000" opacity="0.18" />
      <rect width={W} height={H} rx="10" fill="url(#unoPcb)" stroke="#033f44" strokeWidth="1.5" />
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="8" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="0.8" />
      {[[46, 232], [318, 24], [318, 214]].map(([x, y]) => (<g key={`${x}-${y}`}><circle cx={x} cy={y} r="7" fill="#c9a227" opacity="0.85" /><circle cx={x} cy={y} r="4.6" fill="#0d1b1d" /></g>))}

      {/* Black plastic female headers (the holes are drawn on top of these) */}
      {socket(4, 0, 38)}{socket(52, 0, 106)}{socket(168, 0, 140)}
      {socket(60, H - 16, 120)}{socket(190, H - 16, 120)}

      {/* USB-B (silver, upper left) and DC barrel jack (black, lower left); both overhang the board edge */}
      <rect x="-14" y="72" width="78" height="58" rx="3" fill="url(#unoMetal)" stroke="#444" strokeWidth="1.2" />
      <rect x="-14" y="82" width="6" height="38" fill="#111" />
      <rect x="4" y="77" width="54" height="48" rx="2" fill="none" stroke="#7b838a" strokeWidth="0.8" />
      <rect x="46" y="84" width="10" height="34" fill="#9aa2a9" opacity="0.6" />
      <rect x="-14" y="160" width="68" height="64" rx="3" fill="#161616" stroke="#000" strokeWidth="1.2" />
      <rect x="-14" y="164" width="12" height="56" fill="#080808" />
      <circle cx="18" cy="192" r="15" fill="#262626" stroke="#555" /><circle cx="18" cy="192" r="5" fill="#a0a0a0" />
      <rect x="40" y="166" width="10" height="52" rx="2" fill="#222" stroke="#333" />

      {/* Power section: 2 electrolytic capacitors, regulator, SMD passives */}
      {[172, 200].map((y) => (<g key={y}><circle cx="76" cy={y} r="10" fill="url(#unoCap)" stroke="#555" /><circle cx="76" cy={y} r="6.5" fill="none" stroke="#6a7279" strokeWidth="0.8" /><path d={`M70 ${y} h12`} stroke="#444" strokeWidth="0.8" /></g>))}
      <rect x="94" y="170" width="22" height="16" rx="1.5" fill="#1b1b1b" stroke="#000" /><rect x="96" y="186" width="18" height="4" fill="url(#unoMetal)" />
      {passives.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="0.8" fill={i % 3 ? "#1c1c1c" : "#b08d2e"} stroke="#555" strokeWidth="0.5" />)}

      {/* ATmega16U2 (USB chip) + 16 MHz crystal */}
      <rect x="92" y="98" width="22" height="22" rx="1.5" fill="#1b1b1b" stroke="#000" /><circle cx="97" cy="103" r="1.6" fill="#666" />
      <rect x="124" y="100" width="28" height="10" rx="5" fill="url(#unoMetal)" stroke="#555" />

      {/* ATmega328P in a DIP socket */}
      <rect x="144" y="119" width="142" height="52" rx="2" fill="#0f0f0f" stroke="#000" />
      {Array.from({ length: 14 }, (_, i) => (<g key={i}><rect x={151 + i * 9.2} y="115" width="4" height="6" fill="url(#unoMetal)" /><rect x={151 + i * 9.2} y="169" width="4" height="6" fill="url(#unoMetal)" /></g>))}
      <rect x="150" y="126" width="130" height="38" rx="2" fill="#262626" stroke="#000" />
      <path d="M150,138 a6,6 0 0 1 0,12 z" fill="#0f0f0f" /><circle cx="158" cy="157" r="1.8" fill="#666" />
      <text x="218" y="143" fontSize="7" fill="#d0d0d0" textAnchor="middle">ATMEGA328P-PU</text>
      <text x="218" y="153" fontSize="5.5" fill="#8f8f8f" textAnchor="middle">2615 ARDUINO.CC</text>

      {/* ICSP 2x3 header (decorative) */}
      <rect x="298" y="104" width="26" height="40" rx="2" fill="#15191a" stroke="#000" />
      {[305, 317].flatMap((x) => [113, 125, 137].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#0d0d0d" stroke="#b08d2e" strokeWidth="0.9" />))}
      <text x="311" y="155" fontSize="5.5" textAnchor="middle" {...silk}>ICSP</text>

      {/* RESET: silver tact switch with a red cap (press = restart the sketch) */}
      <rect x="18" y="32" width="26" height="26" rx="3" fill="url(#unoMetal)" stroke="#555" />
      <circle data-reset="1" cx="31" cy="45" r="9" fill={resetDown ? "#7f1d1d" : "#d62828"} stroke="#400" style={{ cursor: "pointer" }} />
      <circle cx="28.5" cy="42.5" r="3" fill="#fff" opacity={resetDown ? 0 : 0.35} pointerEvents="none" />
      <text x="31" y="67" fontSize="6.5" fontWeight="700" textAnchor="middle" {...silk}>RESET</text>

      {/* Status LEDs: L = pin 13, TX/RX = serial activity, ON = power */}
      <Smd x={80} y={50} on={l13} color="#ffb000" text="L" />
      <Smd x={80} y={60} on={tx} color="#ffd400" text="TX" />
      <Smd x={80} y={70} on={rx} color="#ffd400" text="RX" />
      <Smd x={186} y={196} on={powered} color="#22e05a" text="ON" />

      {/* Silkscreen logo and section titles */}
      <text x="182" y="94" fontSize="30" fontWeight="700" textAnchor="middle" {...silk}>∞</text>
      <text x="240" y="86" fontSize="15" fontWeight="700" textAnchor="middle" letterSpacing="1" {...silk}>ARDUINO</text>
      <text x="240" y="101" fontSize="10" fontWeight="700" textAnchor="middle" letterSpacing="4" {...silk}>UNO</text>
      <path d="M60 39 H158 M224 39 H300 M66 214 H98 M142 214 H176 M196 214 H214 M262 214 H300" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.8" />
      <text x="191" y="42" fontSize="7.5" fontWeight="700" textAnchor="middle" {...silk}>DIGITAL (PWM~)</text>
      <text x="120" y="217" fontSize="7.5" fontWeight="700" textAnchor="middle" {...silk}>POWER</text>
      <text x="238" y="217" fontSize="7.5" fontWeight="700" textAnchor="middle" {...silk}>ANALOG IN</text>

      {/* Header holes + pin labels, all generated from arduinoPins */}
      <Hole x={12} y={TOP} /><text x="12" y={TOP + 19} fontSize="5.5" textAnchor="middle" {...silk}>AREF</text>
      {arduinoPins.map((p) => (
        <g key={p.id}>
          <Hole x={p.dx} y={p.dy} />
          <text x={p.dx} y={p.dy === TOP ? TOP + 19 : BOT - 14} fontSize="7.5" textAnchor="middle" {...silk}>{p.label}</text>
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
  arduino: { label: "Arduino Uno", w: ARDUINO.w, h: ARDUINO.h, ox: -14, pins: arduinoPins, Art: UnoArt },   // ox: USB/DC jack overhang the left edge
  soil: mk("Soil Moisture Sensor", 90, 110, ["VCC", "SIG", "GND"], 110, "soil", "SIG", SoilArt),
  temp: mk("Temperature Sensor", 90, 90, ["VCC", "SIG", "GND"], 90, "temp", "SIG", TempArt),
  pump: mk("Water Pump / Valve", 90, 90, ["SIG", "GND"], 90, "pump", "SIG", PumpArt),
  fan: mk("Greenhouse Fan", 90, 90, ["SIG", "GND"], 90, "fan", "SIG", FanArt),
  led: { label: "LED", w: 40, h: 50, role: "led", sig: "ANODE", pins: [{ id: "ANODE", label: "A", dx: 30, dy: 50 }, { id: "CATHODE", label: "K", dx: 10, dy: 50 }], Art: (p) => <LedArt pins={DEVICES.led.pins} {...p} /> },
  button: mk("Push Button", 50, 50, ["SIG", "GND"], 50, "button", "SIG", ButtonArt),
};

// For every pin: half the distance to its nearest neighbour (`near`). App.jsx uses it to size the
// invisible touch circles as large as possible WITHOUT overlapping the next pin.
Object.values(DEVICES).forEach((d) => d.pins.forEach((p) => {
  const gap = Math.min(...d.pins.filter((q) => q !== p).map((q) => Math.hypot(q.dx - p.dx, q.dy - p.dy)));
  p.near = Math.max(4, gap / 2 - 0.5);
}));
