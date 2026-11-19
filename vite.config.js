import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// The dev server proxies /api to FastAPI so no CORS setup is needed while developing.
export default defineConfig({ plugins: [react()], server: { proxy: { "/api": "http://localhost:8000" } } });
