import { defineConfig } from "@playwright/test";

const PORT = 8810;
const FAKE_PORT = 8811;

/**
 * End-to-end tests against the real backend serving the built frontend (`npm run build` first).
 * Each run starts with an empty database in e2e/.data. RAWG and the Steam store are replaced by a fake server
 * (backend/tests/fake_server.py), so no API key or internet is needed.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1400, height: 900 } },
  webServer: [
    {
      command: `cd ../backend && FAKE_BASE=http://localhost:${FAKE_PORT} .venv/bin/python -m uvicorn tests.fake_server:app --port ${FAKE_PORT}`,
      url: `http://localhost:${FAKE_PORT}/steam/api/appdetails?appids=1`,
      reuseExistingServer: false,
    },
    {
      command:
        `rm -rf e2e/.data && mkdir -p e2e/.data && cd ../backend && DATA_DIR=../frontend/e2e/.data ` +
        `RAWG_API_KEY=test-key RAWG_BASE_URL=http://localhost:${FAKE_PORT}/rawg/api ` +
        `STEAM_STORE_URL=http://localhost:${FAKE_PORT}/steam .venv/bin/uvicorn app.main:app --port ${PORT}`,
      url: `http://localhost:${PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
