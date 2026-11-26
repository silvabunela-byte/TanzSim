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
// ======================================================================================
// REALISTIC SMALL PARTS (LED, resistor, push button, sensors, pump, fan, breadboard)
// All drawings are plain SVG so they stay sharp at any zoom level. Colours are dark on purpose:
// the parts sit on the light canvas, only PCB silkscreen text is white.
// Each part exposes its pins (dx, dy = leg tip / pad centre) - wires attach exactly there.
// `links` = pins that are connected INSIDE the part (breadboard columns, resistor ends).
// App.jsx uses `links` + the wires to work out which Arduino pin a part is really wired to.
// `layer` = drawing order (0 = behind everything, default 1).
// ======================================================================================

/** Gradients shared by all parts (identical definitions, so repeating them per part is harmless). */
const Defs = () => (
  <defs>
    <linearGradient id="pBlack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b4046" /><stop offset="1" stopColor="#14171a" /></linearGradient>
    <radialGradient id="pCapRed" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stopColor="#ff7a6b" /><stop offset="1" stopColor="#9d130e" /></radialGradient>
    <radialGradient id="pLedOff" cx="0.4" cy="0.3" r="0.9"><stop offset="0" stopColor="#e0453c" /><stop offset="1" stopColor="#7d1511" /></radialGradient>
    <radialGradient id="pLedOn" cx="0.4" cy="0.3" r="0.9"><stop offset="0" stopColor="#fff1ee" /><stop offset="0.35" stopColor="#ff6a5c" /><stop offset="1" stopColor="#e11d12" /></radialGradient>
    <linearGradient id="pBeige" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f3e2b8" /><stop offset="0.55" stopColor="#d8b977" /><stop offset="1" stopColor="#a98a4b" /></linearGradient>
    <linearGradient id="pSilver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6f8fa" /><stop offset="0.5" stopColor="#b8c0c7" /><stop offset="1" stopColor="#7f8890" /></linearGradient>
    <linearGradient id="pPcb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#157a45" /><stop offset="1" stopColor="#0a4a2a" /></linearGradient>
    <linearGradient id="pBoard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f1ecdc" /><stop offset="1" stopColor="#ddd6c0" /></linearGradient>
    <linearGradient id="pGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e9f4fa" /><stop offset="1" stopColor="#b7d3e2" /></linearGradient>
  </defs>
);
/** Metal leg: dark outline + light core, so it looks like a round wire. `d` is an SVG path. */
const Leg = ({ d }) => (<g fill="none" strokeLinecap="round" strokeLinejoin="round"><path d={d} stroke="#4b5056" strokeWidth="3.2" /><path d={d} stroke="#dfe3e6" strokeWidth="1.9" /></g>);
/** Marker at the exact pin position (leg tip) so the student sees where a wire will attach. */
const Dot = ({ p }) => <circle cx={p.dx} cy={p.dy} r="3.2" fill="#f1d36b" stroke="#6b5200" strokeWidth="0.9" />;
const Lbl = ({ x, y, t, fill = "#16241c", s = 7 }) => <text x={x} y={y} fontSize={s} fontWeight="700" fill={fill} textAnchor="middle" fontFamily="Arial, sans-serif">{t}</text>;
const Shadow = ({ x, y, rx, ry }) => <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#000" opacity="0.14" />;
const SPIN = { transformBox: "fill-box", transformOrigin: "center" };   // rotate around the middle of the shape

/** 5 mm red LED: translucent dome, flange, long anode leg (+) and short cathode leg (-). */
function LedArt({ pins, on }) {
  return (
    <g>
      <Defs />
      {on && <circle cx="20" cy="15" r="28" fill="#ff3b30" opacity="0.28" />}
      {on && <circle cx="20" cy="15" r="19" fill="#ff6a5c" opacity="0.35" />}
      <Leg d="M14 25 V34 L10 40 V50" /><Leg d="M26 25 V34 L30 40 V50" />
      <path d="M6 22 V16 a14 14 0 0 1 28 0 V22 Z" fill={on ? "url(#pLedOn)" : "url(#pLedOff)"} stroke="#5e1410" strokeWidth="1" />
      <path d="M15 22 V14 H25 V22" fill="none" stroke="#fff" strokeOpacity="0.35" />
      <rect x="3" y="21" width="34" height="4.5" rx="1.8" fill={on ? "#ff9488" : "#b5382f"} stroke="#5e1410" strokeWidth="0.8" />
      <ellipse cx="13.5" cy="9.5" rx="3.2" ry="6" fill="#fff" opacity={on ? 0.75 : 0.5} transform="rotate(-20 13.5 9.5)" />
      {pins.map((p) => <Dot key={p.id} p={p} />)}
      <Lbl x={pins[0].dx + 7} y={pins[0].dy - 3} t="+" s={9} /><Lbl x={pins[1].dx - 7} y={pins[1].dy - 3} t="-" s={9} />
    </g>
  );
}
/** 220 ohm axial resistor: beige body with colour bands (red-red-brown-gold) and long leads. */
function ResistorArt() {
  return (
    <g>
      <Defs />
      <Shadow x={45} y={25} rx={24} ry={3} />
      <Leg d="M0 12 H26" /><Leg d="M64 12 H90" />
      <path d="M22 12 q0 -9 8 -9 h30 q8 0 8 9 q0 9 -8 9 h-30 q-8 0 -8 -9 z" fill="url(#pBeige)" stroke="#6e5626" strokeWidth="1" />
      {[[34, "#b3261e"], [41, "#b3261e"], [48, "#6b3d10"], [59, "#d4af37"]].map(([x, c]) => <rect key={x} x={x} y="3.4" width="4" height="17.2" fill={c} />)}
      <rect x="28" y="5" width="34" height="3" rx="1.5" fill="#fff" opacity="0.35" />
      <Dot p={{ dx: 0, dy: 12 }} /><Dot p={{ dx: 90, dy: 12 }} />
      <Lbl x={45} y={33} t="220 Ω" />
    </g>
  );
}
/** 6 mm tactile push button: black body, 4 metal corner legs, round red cap (data-btn = clickable). */
function ButtonArt({ pins, pressed }) {
  return (
    <g>
      <Defs />
      <Shadow x={25} y={43} rx={22} ry={3} />
      <Leg d="M17 38 V50" /><Leg d="M33 38 V50" />
      {[[4, 8], [40, 8], [4, 30], [40, 30]].map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width="6" height="5" fill="url(#pSilver)" stroke="#555" strokeWidth="0.6" />)}
      <rect x="6" y="3" width="38" height="36" rx="4" fill="url(#pBlack)" stroke="#000" />
      <circle cx="25" cy="21" r="14" fill="#1a1d20" stroke="#000" />
      <circle data-btn="1" cx="25" cy={pressed ? 22.5 : 21} r={pressed ? 11 : 12} fill={pressed ? "#8f130e" : "url(#pCapRed)"} stroke="#4a0a07" style={{ cursor: "pointer" }} />
      <ellipse cx="21" cy="16.5" rx="4" ry="2.5" fill="#fff" opacity={pressed ? 0 : 0.45} pointerEvents="none" />
      {pins.map((p) => <Dot key={p.id} p={p} />)}
    </g>
  );
}
/** Capacitive soil-moisture probe: green PCB with electrode traces, small ICs and a 3-pin header. */
function SoilArt({ pins }) {
  return (
    <g>
      <Defs />
      <Shadow x={45} y={106} rx={34} ry={3} />
      <path d="M26 0 H64 L72 8 V96 H18 V8 Z" fill="url(#pPcb)" stroke="#05301a" strokeWidth="1.2" />
      {[28, 36, 44, 52, 60].map((x, i) => <path key={x} d={`M${x} ${i % 2 ? 22 : 10} V${i % 2 ? 62 : 52}`} stroke="#d6f0dc" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />)}
      <rect x="22" y="64" width="46" height="14" fill="#073a20" opacity="0.8" />
      <text x="45" y="73" fontSize="5.5" fill="#fff" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700">SOIL MOISTURE</text>
      <rect x="24" y="82" width="14" height="9" rx="1" fill="#111" /><rect x="44" y="83" width="6" height="6" fill="#c9ad6a" /><rect x="54" y="83" width="6" height="6" fill="#c9ad6a" />
      <rect x="12" y="97" width="66" height="13" rx="2" fill="url(#pBlack)" stroke="#000" />
      {pins.map((p) => <g key={p.id}><Dot p={p} /><Lbl x={p.dx} y={p.dy - 4.5} t={p.label} fill="#fff" s={5.5} /></g>)}
    </g>
  );
}
/** TO-92 temperature sensor: black half-round body with printed marking and three metal legs. */
function TempArt({ pins }) {
  return (
    <g>
      <Defs />
      <Shadow x={45} y={52} rx={20} ry={3} />
      <Leg d="M36 46 L22.5 90" /><Leg d="M45 46 V90" /><Leg d="M54 46 L67.5 90" />
      <path d="M28 48 V26 a17 17 0 0 1 34 0 V48 Z" fill="url(#pBlack)" stroke="#000" strokeWidth="1" />
      <path d="M33 46 V27 a12 12 0 0 1 8 -11" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="2" strokeLinecap="round" />
      <text x="45" y="34" fontSize="7" fill="#d9dde0" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700">TEMP</text>
      <text x="45" y="43" fontSize="5" fill="#9aa1a8" textAnchor="middle" fontFamily="Arial, sans-serif">0-50°C</text>
      {pins.map((p) => <g key={p.id}><Dot p={p} /><Lbl x={p.dx} y={p.dy - 5} t={p.label} s={6} /></g>)}
    </g>
  );
}
/** Mini water pump: clear housing with a spinning impeller, outlet nozzle, motor can and 2 wires. */
function PumpArt({ pins, on }) {
  return (
    <g>
      <Defs />
      <Shadow x={45} y={76} rx={34} ry={3} />
      <path d="M30 72 V90" stroke="#b3261e" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M46 72 Q46 84 60 90" stroke="#15181a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="14" y="56" width="46" height="18" rx="3" fill="url(#pSilver)" stroke="#555" /><text x="37" y="68" fontSize="6" fill="#333" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700">DC MOTOR</text>
      <rect x="62" y="20" width="22" height="14" rx="3" fill="#c9d9e2" stroke="#5b7a8c" />
      <rect x="6" y="6" width="64" height="52" rx="10" fill={on ? "#bfe9d2" : "url(#pGlass)"} stroke="#5b7a8c" strokeWidth="1.2" />
      <g style={SPIN} className={on ? "spin" : ""}>
        <circle cx="36" cy="32" r="19" fill="none" />
        {[0, 60, 120, 180, 240, 300].map((a) => <path key={a} d="M36 32 L36 15 Q45 20 36 32" fill="#8aa7b8" stroke="#4d6878" strokeWidth="0.6" transform={`rotate(${a} 36 32)`} />)}
      </g>
      <circle cx="36" cy="32" r="5" fill="#44525c" stroke="#222" />
      <path d="M12 14 Q22 8 40 10" stroke="#fff" strokeOpacity="0.7" strokeWidth="2" fill="none" strokeLinecap="round" />
      {pins.map((p) => <g key={p.id}><Dot p={p} /><Lbl x={p.dx} y={p.dy - 5} t={p.label} s={6} /></g>)}
    </g>
  );
}
/** 5 V cooling fan: black square frame with corner holes, 7 blades that spin, hub sticker, 2 wires. */
function FanArt({ pins, on }) {
  return (
    <g>
      <Defs />
      <Shadow x={45} y={76} rx={36} ry={3} />
      <path d="M36 72 Q36 84 30 90" stroke="#b3261e" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M54 72 Q54 84 60 90" stroke="#15181a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="9" y="2" width="72" height="72" rx="9" fill="url(#pBlack)" stroke="#000" strokeWidth="1.2" />
      {[[16, 9], [74, 9], [16, 67], [74, 67]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="3.4" fill="#0b0c0d" stroke="#555" />)}
      <circle cx="45" cy="38" r="31" fill="#0a0b0c" stroke="#333" />
      <g style={SPIN} className={on ? "spin" : ""}>
        <circle cx="45" cy="38" r="29" fill="none" />
        {Array.from({ length: 7 }, (_, i) => <path key={i} d="M45 38 C40 24 48 12 58 14 C56 24 52 32 45 38" fill={on ? "#46586a" : "#2f3b45"} stroke="#12181d" strokeWidth="0.6" transform={`rotate(${i * 51.4} 45 38)`} />)}
      </g>
      <circle cx="45" cy="38" r="9" fill="url(#pSilver)" stroke="#444" /><text x="45" y="40.5" fontSize="6" textAnchor="middle" fill="#333" fontFamily="Arial, sans-serif" fontWeight="700">5V</text>
      {pins.map((p) => <g key={p.id}><Dot p={p} /><Lbl x={p.dx} y={p.dy - 5} t={p.label} s={6} /></g>)}
    </g>
  );
}

// ---- Mini breadboard: 20 columns x (a-e | f-j) + 4 power rails -----------------------------------
// Holes in the same column (a-e or f-j) are connected, and every hole of one rail is connected.
const BB = { cols: 20, pitch: 14, x0: 20 };
const bbX = (c) => BB.x0 + (c - 1) * BB.pitch;
const BB_ROWS = { a: 62, b: 76, c: 90, d: 104, e: 118, f: 142, g: 156, h: 170, i: 184, j: 198 };   // y of each hole row
const BB_RAILS = { tp: [16, "+ rail (top)"], tn: [30, "- rail (top)"], bp: [228, "+ rail (bottom)"], bn: [242, "- rail (bottom)"] };
const RAIL_COLS = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19];           // 15 holes per rail
const bbPins = [], bbLinks = [];
for (let c = 1; c <= BB.cols; c++) {
  for (const [r, y] of Object.entries(BB_ROWS)) bbPins.push({ id: `${r}${c}`, label: `${r}${c}`, name: `${r.toUpperCase()}${c}`, dx: bbX(c), dy: y });
  bbLinks.push(["a", "b", "c", "d", "e"].map((r) => `${r}${c}`), ["f", "g", "h", "i", "j"].map((r) => `${r}${c}`));
}
for (const [rid, [y, name]] of Object.entries(BB_RAILS)) {
  const ids = RAIL_COLS.map((c, i) => { bbPins.push({ id: `${rid}${i + 1}`, label: rid, name, dx: bbX(c), dy: y }); return `${rid}${i + 1}`; });
  bbLinks.push(ids);
}
const BB_W = BB.x0 * 2 + (BB.cols - 1) * BB.pitch, BB_H = 260;

function BreadboardArt() {
  return (
    <g>
      <Defs />
      <rect x="3" y="5" width={BB_W} height={BB_H} rx="8" fill="#000" opacity="0.14" />
      <rect width={BB_W} height={BB_H} rx="8" fill="url(#pBoard)" stroke="#b7b09a" strokeWidth="1.2" />
      <rect x="8" y="124" width={BB_W - 16} height="14" rx="2" fill="#cdc6b0" /><rect x="8" y="129" width={BB_W - 16} height="2" fill="#a9a38d" opacity="0.7" />
      <path d={`M12 8 H${BB_W - 12} M12 220 H${BB_W - 12}`} stroke="#d62828" strokeWidth="1.5" /><path d={`M12 38 H${BB_W - 12} M12 252 H${BB_W - 12}`} stroke="#2e6fd0" strokeWidth="1.5" />
      {bbPins.map((p) => <rect key={p.id} x={p.dx - 3} y={p.dy - 3} width="6" height="6" rx="1" fill="#2b2a26" />)}
      {[1, 5, 10, 15, 20].map((c) => <g key={c}><Lbl x={bbX(c)} y={53} t={c} fill="#8a8473" s={6} /><Lbl x={bbX(c)} y={213} t={c} fill="#8a8473" s={6} /></g>)}
      {Object.entries(BB_ROWS).map(([r, y]) => <Lbl key={r} x={9} y={y + 2} t={r.toUpperCase()} fill="#8a8473" s={6} />)}
      {Object.entries(BB_RAILS).map(([rid, [y]]) => <Lbl key={rid} x={9} y={y + 3} t={rid.endsWith("p") ? "+" : "-"} fill={rid.endsWith("p") ? "#d62828" : "#2e6fd0"} s={9} />)}
    </g>
  );
}

// ---- HC-SR04 ultrasonic distance sensor --------------------------------------------------------
// Front view, drawn at the same scale as the Arduino (about 4.8 units per mm): blue PCB, two silver
// transducer cans (left = transmitter "T", right = receiver "R"), crystal, two ICs and the 4-pin header.
// Pin order on the real board: VCC, TRIG, ECHO, GND (pitch 11 units here so the header fits between the cans).
// The simulator reads TRIG and ECHO through `extra` (see DEVICES.ultra): both must be wired to Arduino pins.
const US_PINS = [["VCC", "VCC (5 V)"], ["TRIG", "TRIG (trigger input)"], ["ECHO", "ECHO (pulse output)"], ["GND", "GND"]]
  .map(([id, name], i) => ({ id, label: id, name, dx: 91.5 + i * 11, dy: 89 }));

function UltrasonicArt() {
  /** One metal transducer can: shiny rim, dark mesh with rings, tiny centre dot. */
  const Can = ({ cx }) => (
    <g>
      <circle cx={cx} cy="44" r="36" fill="#0d1013" opacity="0.35" />
      <circle cx={cx} cy="44" r="34" fill="url(#usRim)" stroke="#59626a" strokeWidth="1" />
      <circle cx={cx} cy="44" r="28" fill="#2a2f34" stroke="#9aa3aa" strokeWidth="1.2" />
      <circle cx={cx} cy="44" r="24" fill="url(#usMesh)" />
      {[7, 12, 17, 21].map((r) => <circle key={r} cx={cx} cy="44" r={r} fill="none" stroke="#050607" strokeWidth="0.8" opacity="0.65" />)}
      <circle cx={cx} cy="44" r="3" fill="#040506" />
      <ellipse cx={cx - 11} cy="31" rx="9" ry="4.5" fill="#fff" opacity="0.14" transform={`rotate(-30 ${cx - 11} 31)`} />
    </g>
  );
  return (
    <g>
      <defs>
        <linearGradient id="usPcb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1f6fc2" /><stop offset="1" stopColor="#0f4a94" /></linearGradient>
        <radialGradient id="usRim" cx="0.4" cy="0.35" r="0.85"><stop offset="0" stopColor="#f7f9fa" /><stop offset="0.6" stopColor="#b3bcc3" /><stop offset="1" stopColor="#7a848c" /></radialGradient>
        <radialGradient id="usMesh" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#4a5158" /><stop offset="1" stopColor="#0f1214" /></radialGradient>
      </defs>
      <ellipse cx="110" cy="94" rx="100" ry="3" fill="#000" opacity="0.14" />
      <rect width="216" height="96" rx="5" fill="url(#usPcb)" stroke="#0a2f63" strokeWidth="1.2" />
      <Can cx={52} /><Can cx={164} />
      <text x="108" y="15" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle" fontFamily="Arial, sans-serif">HC-SR04</text>
      <text x="108" y="22" fontSize="4.6" fill="#cfe3ff" textAnchor="middle" fontFamily="Arial, sans-serif">ULTRASONIC MODULE</text>
      <text x="9" y="11" fontSize="7" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">T</text>
      <text x="203" y="11" fontSize="7" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">R</text>
      <rect x="98" y="28" width="20" height="8" rx="4" fill="url(#usRim)" stroke="#59626a" strokeWidth="0.6" />
      <rect x="92" y="42" width="14" height="9" rx="1" fill="#14171a" /><rect x="110" y="42" width="14" height="9" rx="1" fill="#14171a" />
      {[[91, 55], [101, 55], [111, 55], [121, 55]].map(([x, y]) => <rect key={x} x={x} y={y} width="6" height="3" fill="#c9ad6a" />)}
      <rect x="84" y="82" width="50" height="14" rx="2" fill="url(#pBlack)" stroke="#000" />
      {US_PINS.map((p) => (
        <g key={p.id}>
          <Dot p={p} />
          <text transform={`translate(${p.dx + 2} 78) rotate(-90)`} fontSize="5.5" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">{p.label}</text>
        </g>
      ))}
    </g>
  );
}

const mk = (label, w, h, ids, py, role, sig, Art) => {
  const pins = bottomPins(ids, w, py);
  return { label, w, h, pins, role, sig, Art: (props) => <Art pins={pins} {...props} /> };
};
const bottomPins = (ids, w, y) => ids.map((id, i) => ({ id, label: id, dx: (w / (ids.length + 1)) * (i + 1), dy: y }));

const LED_PINS = [{ id: "ANODE", label: "A", name: "LED anode (+, long leg)", dx: 30, dy: 50 }, { id: "CATHODE", label: "K", name: "LED cathode (-, short leg)", dx: 10, dy: 50 }];
const RES_PINS = [{ id: "A", label: "A", name: "Resistor end A", dx: 0, dy: 12 }, { id: "B", label: "B", name: "Resistor end B", dx: 90, dy: 12 }];

export const DEVICES = {
  arduino: { label: "Arduino Uno", w: ARDUINO.w, h: ARDUINO.h, ox: -14, pins: arduinoPins, Art: UnoArt },   // ox: USB/DC jack overhang the left edge
  breadboard: { label: "Breadboard (mini)", w: BB_W, h: BB_H, layer: 0, pins: bbPins, links: bbLinks, Art: BreadboardArt },
  resistor: { label: "Resistor 220 Ω", w: 90, h: 34, pins: RES_PINS, links: [["A", "B"]], Art: ResistorArt },   // links: current flows A <-> B
  soil: mk("Soil Moisture Sensor", 90, 110, ["VCC", "SIG", "GND"], 110, "soil", "SIG", SoilArt),
  temp: mk("Temperature Sensor", 90, 90, ["VCC", "SIG", "GND"], 90, "temp", "SIG", TempArt),
  pump: mk("Water Pump / Valve", 90, 90, ["SIG", "GND"], 90, "pump", "SIG", PumpArt),
  fan: mk("Greenhouse Fan", 90, 90, ["SIG", "GND"], 90, "fan", "SIG", FanArt),
  led: { label: "LED", w: 40, h: 50, role: "led", sig: "ANODE", pins: LED_PINS, Art: (p) => <LedArt pins={LED_PINS} {...p} /> },
  button: mk("Push Button", 50, 50, ["SIG", "GND"], 50, "button", "SIG", ButtonArt),
};

// For every pin: half the distance to its nearest neighbour (`near`). App.jsx uses it to size the
// invisible touch circles as large as possible WITHOUT overlapping the next pin.
Object.values(DEVICES).forEach((d) => d.pins.forEach((p) => {
  const gap = Math.min(...d.pins.filter((q) => q !== p).map((q) => Math.hypot(q.dx - p.dx, q.dy - p.dy)));
  p.near = Math.max(4, gap / 2 - 0.5);
}));
