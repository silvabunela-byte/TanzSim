"""
physics_engine.py - one tick of the farm model.

The model is intentionally simple (first-order, linear) so students can read it
and change it. Swap in a better crop-water model here without touching
the parser or the frontend: only step() and its signature matter.
"""
from config import PHYSICS as P


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def step(state: dict, pump_on: bool, fan_on: bool, dt: float) -> dict:
    """Advance the farm by `dt` seconds and return a NEW state dict.

    state keys: soil_moisture (%), temperature (C), ambient (C), button (bool)
    """
    soil, temp, amb = state["soil_moisture"], state["temperature"], state["ambient"]

    if pump_on:   # irrigation adds water
        soil += P["pump_rate"] * dt
    else:         # evapotranspiration grows with heat above 20 C
        soil -= P["evap_base"] * (1 + max(0.0, temp - 20) * P["evap_temp_gain"]) * dt

    if fan_on:    # forced cooling
        temp -= P["fan_cool"] * dt
    else:         # drift back toward ambient
        temp += (amb - temp) * P["relax"] * dt

    new = dict(state)
    new["soil_moisture"] = round(_clamp(soil, P["soil_min"], P["soil_max"]), 2)
    new["temperature"] = round(_clamp(temp, P["temp_min"], P["temp_max"]), 2)
    return new
