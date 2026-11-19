"""
api/index.py - FastAPI server for TanzSim (Vercel entry point).

Local run (from the repo root):  uvicorn api.index:app --reload --port 8000
On Vercel this file is deployed as a serverless function.

STATELESS DESIGN: serverless instances do not share memory, so the server keeps
NOTHING between requests. The sketch's memory (global variables, pin output levels,
half-printed Serial line) is returned to the browser as `sketch` after every tick and
sent back with the next tick. This behaves like a real Arduino keeping its RAM.
"""
import os
import sys

# Make sibling modules (config, parser_engine, physics_engine) importable on Vercel.
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config
from parser_engine import CodeError, Runtime, compile_code
from physics_engine import step

app = FastAPI(title="TanzSim API")
# Open CORS is fine for a lab network. For a public deployment, list the real origins.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class TickIn(BaseModel):
    session_id: str = ""        # unused now; kept so older clients still work
    code: str
    state: dict                 # soil_moisture, temperature, ambient, button
    bindings: dict = {}         # role -> Arduino pin number, derived from wires
    dt: float = 1.0
    sketch: dict | None = None  # sketch memory from the previous tick (None = fresh start)
    reset: bool = False         # True -> restart the sketch (runs setup() again)


class CodeIn(BaseModel):
    code: str


@app.get("/api/config")
def get_config():
    """Everything the frontend needs to brand itself and list scenarios/crops."""
    return {"institution": config.INSTITUTION, "crops": config.CROPS, "scenarios": config.SCENARIOS}


@app.post("/api/validate")
def validate(body: CodeIn):
    """Compile only (no execution) so students get syntax errors quickly."""
    try:
        compile_code(body.code)
        return {"ok": True}
    except CodeError as e:
        return {"ok": False, "error": str(e), "line": e.line}


@app.post("/api/tick")
def tick(b: TickIn):
    """Run loop() once with the current sensor values, then advance the physics."""
    P, bind, serial = config.PHYSICS, b.bindings, []
    try:
        rt = Runtime(b.code)  # parses the code and initialises globals (cheap)
        if b.reset or b.sketch is None:       # fresh start -> run setup() once
            serial += rt.run("setup", _inputs(b.state, bind, P))
        else:                                  # restore the Arduino's "RAM" from the last tick
            rt.vars.update(b.sketch.get("vars", {}))
            rt.outputs = {int(k): v for k, v in b.sketch.get("outputs", {}).items()}  # JSON keys are strings
            rt.buf = b.sketch.get("buf", "")
        serial += rt.run("loop", _inputs(b.state, bind, P))
    except CodeError as e:
        return {"state": b.state, "outputs": {}, "serial": [f"[ERROR] {e}"], "error": str(e)}
    out = rt.outputs
    on = lambda role: bool(out.get(bind.get(role))) if bind.get(role) is not None else False
    new_state = step(b.state, on("pump"), on("fan"), b.dt)
    return {"state": new_state, "outputs": out, "serial": serial, "error": None,
            "sketch": {"vars": rt.vars, "outputs": rt.outputs, "buf": rt.buf},
            "actuators": {"pump": on("pump"), "fan": on("fan")}}


def _inputs(st, bind, P):
    """Translate physical quantities into what Arduino pins would read."""
    io = {"digital": {}, "analog": {}}
    if bind.get("button") is not None:
        io["digital"][bind["button"]] = 1 if st.get("button") else 0
    if bind.get("soil") is not None:   # 0-100 % -> 0-1023 (10-bit ADC)
        io["analog"][bind["soil"] - 14] = round(st["soil_moisture"] / 100 * 1023)
    if bind.get("temp") is not None:
        io["analog"][bind["temp"] - 14] = round(st["temperature"] / P["temp_full_scale"] * 1023)
    return io
