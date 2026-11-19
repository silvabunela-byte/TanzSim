"""
config.py - THE single place a department edits to adapt TanzSim.

TanzSim is built as a campus-wide teaching platform for SUA's School of
Engineering Sciences and Technology (SoEST). To add a new degree program,
course or lab exercise you normally only touch THIS file:

  * INSTITUTION : branding + the list of programs that use the platform
  * CROPS       : crop presets (Agricultural Engineering, Crop Science, ...)
  * SCENARIOS   : ready-made circuits + starter Arduino code per course
  * PHYSICS     : tunable constants of the farm model (no code changes needed)

Nothing here is hard-wired to agriculture: another program (e.g. Electrical,
Civil/Water, Food Engineering) can add its own scenarios and presets.
"""

INSTITUTION = {
    "name": "TanzSim",
    "tagline": "SUA EPAL Arduino & Precision Agriculture Simulator",
    "university": "Sokoine University of Agriculture (SUA)",
    "lab": "Electronics and Precision Agriculture Lab (SUA EPAL)",
    # Colours become CSS variables in the frontend (see App.jsx -> applyTheme).
    "theme": {"green": "#1b6b3a", "green_soft": "#e6f2ea", "gold": "#e0a400", "ink": "#16241c"},
    # Programs/courses that may use the simulator. Purely informational for now;
    # a future login system could filter scenarios per program using this list.
    "programs": [
        "Agricultural Engineering (AGE 316 Microcomputer Systems)",
        "Other programs under the School of Engineering Sciences and Technology",
    ],
}

# Constants of the farm physics model (units: percent, degrees C, per second).
PHYSICS = {
    "pump_rate": 1.5,       # soil moisture gained per second while pump is ON (%/s)
    "evap_base": 0.2,       # moisture lost per second while pump is OFF (%/s)
    "evap_temp_gain": 0.04, # extra evaporation per degree C above 20 C
    "fan_cool": 0.3,        # cooling per second while fan is ON (C/s)
    "relax": 0.05,          # how fast temperature drifts to ambient when fan is OFF
    "soil_min": 0.0, "soil_max": 100.0,
    "temp_min": 5.0, "temp_max": 50.0,
    "temp_full_scale": 50.0,  # temperature sensor reads 0..this C as 0..1023
}

# Crop presets: starting conditions + suggested thresholds shown to the student.
CROPS = [
    {"id": "maize", "name": "Maize / Mahindi", "soil": 35, "temp": 27, "ambient": 28, "dry_below": 40},
    {"id": "tomato", "name": "Tomato / Nyanya", "soil": 55, "temp": 25, "ambient": 26, "dry_below": 60},
    {"id": "seedling", "name": "Greenhouse Seedling", "soil": 65, "temp": 30, "ambient": 32, "dry_below": 70},
]

# Pin naming used by circuits: 'D0'..'D13', 'A0'..'A5', '5V', '3V3', 'GND'.
def _drip_code():
    return """// Smart Drip Irrigation - AGE 316 starter
// Wire: soil SIG -> A0, pump SIG -> D8, LED anode -> D13
const int SOIL_PIN = A0;
const int PUMP_PIN = 8;
const int LED_PIN  = 13;

void setup() {
  Serial.begin(9600);
  pinMode(PUMP_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int raw = analogRead(SOIL_PIN);          // 0..1023
  int pct = map(raw, 0, 1023, 0, 100);     // convert to percent
  Serial.print("Soil %: ");
  Serial.println(pct);
  if (pct < 40) {            // too dry -> irrigate
    digitalWrite(PUMP_PIN, HIGH);
    digitalWrite(LED_PIN, HIGH);
  } else if (pct > 70) {     // wet enough -> stop
    digitalWrite(PUMP_PIN, LOW);
    digitalWrite(LED_PIN, LOW);
  }
}
"""

def _greenhouse_code():
    return """// Greenhouse Climate Control
// Wire: temp SIG -> A1, fan SIG -> D9, button SIG -> D2
const int TEMP_PIN = A1;
const int FAN_PIN = 9;
const int BTN_PIN = 2;

void setup() {
  Serial.begin(9600);
  pinMode(FAN_PIN, OUTPUT);
  pinMode(BTN_PIN, INPUT);
}

void loop() {
  int t = map(analogRead(TEMP_PIN), 0, 1023, 0, 50);  // degrees C
  Serial.print("Temp C: ");
  Serial.println(t);
  if (t > 30 || digitalRead(BTN_PIN) == HIGH) {  // hot OR manual override
    digitalWrite(FAN_PIN, HIGH);
  } else {
    digitalWrite(FAN_PIN, LOW);
  }
}
"""

def _arduino(x=300, y=40):
    return {"id": "uno", "type": "arduino", "x": x, "y": y}

# A scenario = starter code + devices on the canvas + wires between pins.
# Device types are defined in src/components/registry.jsx.
SCENARIOS = [
    {
        "id": "drip", "name": "Smart Drip Irrigation", "code": _drip_code(),
        "devices": [_arduino(), {"id": "soil", "type": "soil", "x": 120, "y": 300},
                    {"id": "pump", "type": "pump", "x": 520, "y": 300},
                    {"id": "led", "type": "led", "x": 640, "y": 40}],
        "wires": [("soil", "SIG", "uno", "A0", "#2e7dd7"), ("soil", "VCC", "uno", "5V", "#d62828"),
                  ("soil", "GND", "uno", "GND", "#111111"), ("pump", "SIG", "uno", "D8", "#1b6b3a"),
                  ("led", "ANODE", "uno", "D13", "#e0a400")],
    },
    {
        "id": "greenhouse", "name": "Greenhouse Climate Control", "code": _greenhouse_code(),
        "devices": [_arduino(), {"id": "temp", "type": "temp", "x": 140, "y": 300},
                    {"id": "fan", "type": "fan", "x": 520, "y": 300},
                    {"id": "btn", "type": "button", "x": 60, "y": 60}],
        "wires": [("temp", "SIG", "uno", "A1", "#2e7dd7"), ("fan", "SIG", "uno", "D9", "#1b6b3a"),
                  ("btn", "SIG", "uno", "D2", "#e0a400")],
    },
]
