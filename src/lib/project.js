/**
 * project.js - saving and opening TanzSim projects.
 *
 * A project is plain JSON:  { format, version, name, savedAt, scenarioId, devices, wires, code, sim }
 * Two ways to keep it:
 *   1) FILE      : downloadProject() / parseProject()  -> "my-farm.tanzsim.json" on the student's phone or laptop
 *   2) AUTOSAVE  : saveLocal() / loadLocal()           -> the browser remembers the last project after a refresh
 * Everything that comes back from a file or from storage goes through parseProject(), which checks it
 * against the real device registry, so a damaged or hand-edited file can never crash the simulator.
 */
const KEY = "tanzsim.autosave.v1";
export const FORMAT = "tanzsim-project";
const HEX = /^#[0-9a-f]{3,8}$/i;
const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== "" ? +v : d);

export const serializeProject = ({ name, scenarioId, devices, wires, code, sim }) => ({
  format: FORMAT, version: 1, name, savedAt: new Date().toISOString(), scenarioId, devices, wires, code, sim,
});

/** Validate + clean a project. Returns { ok:true, project, dropped } or { ok:false, error }. `DEV` = DEVICES registry. */
export function parseProject(input, DEV) {
  let o;
  try { o = typeof input === "string" ? JSON.parse(input) : input; } catch { return { ok: false, error: "This file is not valid JSON." }; }
  if (!o || o.format !== FORMAT) return { ok: false, error: "This is not a TanzSim project file." };
  if (!Array.isArray(o.devices) || o.devices.length === 0 || o.devices.length > 200) return { ok: false, error: "The project has no parts (or too many)." };

  const ids = new Set(), devices = [];
  for (const d of o.devices) {
    if (!d || typeof d.id !== "string" || !DEV[d.type] || ids.has(d.id)) continue;   // unknown part type or duplicate id: skip it
    ids.add(d.id); devices.push({ id: d.id, type: d.type, x: num(d.x, 0), y: num(d.y, 0) });
  }
  if (!devices.length) return { ok: false, error: "None of the parts in this file are known to this version of TanzSim." };

  const hasPin = (ref) => { const d = devices.find((x) => x.id === ref?.dev); return !!d && DEV[d.type].pins.some((p) => p.id === ref.pin); };
  const wireIds = new Set(), wires = []; let dropped = 0;
  (Array.isArray(o.wires) ? o.wires : []).forEach((w, i) => {
    if (!w || !hasPin(w.a) || !hasPin(w.b)) { dropped++; return; }               // wire to a part/pin that does not exist
    const id = typeof w.id === "string" && !wireIds.has(w.id) ? w.id : `w${i}_${wires.length}`; wireIds.add(id);
    const pts = (Array.isArray(w.pts) ? w.pts : []).filter((q) => q && Number.isFinite(+q.x) && Number.isFinite(+q.y)).map((q) => ({ x: +q.x, y: +q.y }));
    wires.push({ id, a: { dev: w.a.dev, pin: w.a.pin }, b: { dev: w.b.dev, pin: w.b.pin }, color: HEX.test(w.color) ? w.color : "#1b6b3a", pts });
  });

  const s = o.sim || {};
  const project = {
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 60) : "my-project",
    scenarioId: typeof o.scenarioId === "string" ? o.scenarioId : "",
    devices, wires,
    code: typeof o.code === "string" ? o.code.slice(0, 100000) : "",
    sim: { soil_moisture: num(s.soil_moisture, 40), temperature: num(s.temperature, 27), ambient: num(s.ambient, 28), button: !!s.button },
  };
  return { ok: true, project, dropped };
}

/** Download the project as a file (works on phones too). */
export function downloadProject(project, name) {
  const file = (name || "my-project").replace(/[^\w\-]+/g, "_") + ".tanzsim.json";
  const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: file });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- autosave in the browser (private/blocked storage must never break the app, hence try/catch) ----
export function saveLocal(project) { try { localStorage.setItem(KEY, JSON.stringify(project)); } catch { /* storage full or blocked: ignore */ } }
export function loadLocal(DEV) {
  try { const raw = localStorage.getItem(KEY); const r = raw && parseProject(raw, DEV); return r && r.ok ? r.project : null; } catch { return null; }
}
