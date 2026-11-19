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

// ---- Arduino Uno -------------------------------------------------------------
// SINGLE SOURCE OF TRUTH FOR PIN POSITIONS: every pad drawn below, every invisible hit circle
// in App.jsx and every wire end point is computed from this one `arduinoPins` array.
// Edit a pin's dx/dy here and the drawing, the hit area, the tooltip and the wires all follow.
// dx/dy = centre of the pad, relative to the board's top-left corner.
export const ARDUINO = { w: 330, h: 170 };
const TOP = 8;                    // y of the top header pads
const BOT = ARDUINO.h - 8;        // y of the bottom header pads

// id: used by wires and the pin map | label: small text on the board | name: tooltip text
// hit: radius of the invisible click target (kept just under half the pitch so neighbours never overlap)
const mkPin = (id, label, dx, dy, hit, name = id) => ({ id, label, name, dx, dy, hit });

const arduinoPins = [
  mkPin("GND2", "GND", 32, TOP, 8, "GND"),                                        // extra GND next to pin 13
  // Digital header, as on the real Uno: 13..8 | gap | 7..0  (pitch 17, the gap sits between 8 and 7)
  ...[13, 12, 11, 10, 9, 8].map((n, i) => mkPin(`D${n}`, `${n}`, 62 + i * 17, TOP, 8)),
  ...[7, 6, 5, 4, 3, 2, 1, 0].map((n, i) => mkPin(`D${n}`, `${n}`, 178 + i * 17, TOP, 8)),
  // Power header (bottom left of centre) and analog header (bottom right), pitch 20
  mkPin("3V3", "3V3", 100, BOT, 9, "3.3V"), mkPin("5V", "5V", 120, BOT, 9), mkPin("GND", "GND", 140, BOT, 9),
  ...[0, 1, 2, 3, 4, 5].map((i) => mkPin(`A${i}`, `A${i}`, 190 + i * 20, BOT, 9, `A${i} (D${14 + i})`)),
];

const Pin = ({ p, color = "#c9a227" }) => <circle cx={p.dx} cy={p.dy} r="4" fill={color} stroke={ink} strokeWidth="1" />;

/** Small status LED with a soft glow. Used for L (pin 13), TX, RX and ON (power). */
const BoardLed = ({ cx, cy, on, color, text }) => (
  <g>
    {on && <circle cx={cx} cy={cy} r="8" fill={color} opacity="0.35" />}
    <circle cx={cx} cy={cy} r="3.5" fill={on ? color : "#0b3d3f"} stroke="#062b2d" strokeWidth="0.8" />
    <text x={cx} y={cy + 12} fontSize="6.5" fill="#d6f1ee" textAnchor="middle">{text}</text>
  </g>
);

/**
 * Arduino Uno drawing. `board` is supplied by App.jsx:
 *   powered   -> green ON LED        l13  -> yellow "L" LED (pin 13 is HIGH)
 *   tx / rx   -> serial activity     resetDown -> RESET button looks pressed
 * The RESET cap carries data-reset="1"; App.jsx listens for it and restarts the sketch.
 */
function UnoArt({ board = {} }) {
  const { powered = false, l13 = false, tx = false, rx = false, resetDown = false } = board;
  const strip = (x, y, w) => <rect x={x} y={y} width={w} height="16" rx="2" fill="#1f2a24" />;  // black header socket
  return (
    <g>
      <rect width={ARDUINO.w} height={ARDUINO.h} rx="8" fill="#00797d" stroke={ink} strokeWidth="1.5" />

      {/* Header sockets (drawn under the pads) */}
      {strip(4, 0, 38)}{strip(52, 0, 106)}{strip(168, 0, 140)}
      {strip(88, ARDUINO.h - 16, 64)}{strip(180, ARDUINO.h - 16, 120)}

      {/* USB-B port: mid-left, fully inside the board outline, silver with a black border */}
      <rect x="8" y="72" width="46" height="36" rx="2" fill="#c9ced3" stroke="#000" strokeWidth="1.5" />
      <rect x="14" y="78" width="34" height="24" fill="#8d949a" stroke="#555" />
      <text x="31" y="94" fontSize="8" fontWeight="700" fill={ink} textAnchor="middle">USB</text>

      {/* DC barrel jack: bottom-left, under the USB port */}
      <rect x="8" y="118" width="46" height="40" rx="3" fill="#1c1c1c" stroke="#000" />
      <circle cx="31" cy="136" r="9" fill="#333" stroke="#888" /><circle cx="31" cy="136" r="3" fill="#888" />
      <text x="31" y="154" fontSize="6.5" fill="#ccc" textAnchor="middle">DC</text>

      {/* Voltage regulator, 16 MHz crystal and the ATmega328P (technical detail, decorative) */}
      <rect x="66" y="118" width="26" height="16" rx="2" fill="#222" /><text x="79" y="129" fontSize="6" fill="#ddd" textAnchor="middle">REG</text>
      <rect x="102" y="74" width="28" height="11" rx="5" fill="#d9dde0" stroke={ink} /><text x="116" y="82" fontSize="5.5" fill={ink} textAnchor="middle">16MHz</text>
      <rect x="140" y="62" width="96" height="34" rx="2" fill="#1d1d1d" /><text x="188" y="83" fontSize="8" fill="#ddd" textAnchor="middle">ATmega328P</text>

      {/* ICSP 2x3 header (decorative, not wirable) */}
      <rect x="298" y="70" width="26" height="42" rx="2" fill="#1f2a24" />
      {[305, 317].flatMap((x) => [79, 91, 103].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#c9a227" />))}
      <text x="311" y="122" fontSize="5.5" fill="#fff" textAnchor="middle">ICSP</text>

      {/* AREF pad (decorative) */}
      <circle cx="12" cy={TOP} r="4" fill="#c9a227" stroke={ink} /><text x="12" y={TOP + 19} fontSize="5.5" fill="#fff" textAnchor="middle">AREF</text>

      {/* RESET button: press it to restart the sketch (handled in App.jsx -> boardReset) */}
      <rect x="16" y="34" width="24" height="24" rx="3" fill="#bfc5c9" stroke={ink} />
      <circle data-reset="1" cx="28" cy="46" r="8" fill={resetDown ? "#7f1d1d" : "#d62828"} stroke={ink} style={{ cursor: "pointer" }} />
      <text x="28" y="67" fontSize="5.5" fill="#fff" textAnchor="middle">RESET</text>

      {/* Status LEDs: L = pin 13, TX/RX = serial activity, ON = power */}
      <BoardLed cx={70} cy={42} on={l13} color="#ffb000" text="L" />
      <BoardLed cx={252} cy={42} on={tx} color="#ffd400" text="TX" />
      <BoardLed cx={276} cy={42} on={rx} color="#ffd400" text="RX" />
      <BoardLed cx={236} cy={128} on={powered} color="#22e05a" text="ON" />

      <text x="165" y="122" fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle">ARDUINO UNO</text>

      {/* Header pads + labels, all generated from arduinoPins */}
      {arduinoPins.map((p) => (
        <g key={p.id}>
          <Pin p={p} />
          <text x={p.dx} y={p.dy === TOP ? TOP + 19 : BOT - 14} fontSize="8" fill="#fff" textAnchor="middle">{p.label}</text>
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
