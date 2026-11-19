# TanzSim - SUA EPAL Arduino and Precision Agriculture Simulator

## Repo layout (ready for Vercel)
- api/            FastAPI backend (index.py = entry point, config.py, parser_engine.py, physics_engine.py)
- src/            React frontend (App.jsx, components/registry.jsx, styles.css)
- vercel.json     routes /api/* to the Python function
- requirements.txt  Python dependencies (must stay in the repo root for Vercel)

## Run locally (two terminals, from the repo root)
    pip install -r requirements.txt
    uvicorn api.index:app --reload --port 8000
    npm install
    npm run dev          # http://localhost:5173 (Vite proxies /api to port 8000)

## Deploy on Vercel
Push to GitHub -> Vercel "Add New Project" -> import repo -> Framework preset "Vite" -> Deploy.
If the Python function is not detected, check Vercel's current Python/FastAPI docs for the entry-point name.

## Where to change things
- New program, scenario, crop, branding, physics constants -> api/config.py
- New device on the canvas -> src/components/registry.jsx
- New Arduino function or C++ feature -> api/parser_engine.py
- Farm model -> api/physics_engine.py
