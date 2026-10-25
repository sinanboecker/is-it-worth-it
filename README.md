# Is It Worth It?

Self-hosted tracker for games and gaming/PC hardware: purchases (copies, DLC, bundles), playtime per device,
cost per hour and break-even, journal and wishlist. See [PLANNING.md](PLANNING.md) for the full plan.

## Development

The backend serves the API under `/api` and, once built, the web frontend at `/` (one process, one port).

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"

.venv/bin/uvicorn app.main:app --reload      # http://localhost:8000/api/docs
.venv/bin/python -m pytest                   # tests
.venv/bin/ruff check app tests && .venv/bin/ruff format app tests
```

Data is stored in `backend/data/app.db` (override with `DATA_DIR`). Tables are created on startup.

Game info and images come from [RAWG](https://rawg.io): get a free API key ("Get API key") and start the backend with
`RAWG_API_KEY=<your key>`. Without a key everything works, just without metadata lookups. The DLC list with prices comes
from the public Steam store (no key needed).

Command line tools (run from `backend/`):

```bash
.venv/bin/python -m app.cli import-csv ../test_pc.csv --category PC --device "Gaming PC" --store Steam --dry-run
.venv/bin/python -m app.cli export -o backup.json          # add --images for a ZIP with covers/uploads
.venv/bin/python -m app.cli import-json backup.json --mode replace
```

There are no database migrations yet: after changing a model, delete `backend/data/app.db` (or restore a JSON export
into a fresh database).

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api to the backend on :8000
npm run build        # production build to frontend/dist (served by the backend)
npm run typecheck
npm test             # unit tests (Vitest)
npx playwright install chromium   # once
npm run e2e          # builds, starts the backend (empty database, fake RAWG/Steam server), runs the browser tests
npm run gen:api      # regenerate src/api/schema.d.ts after API changes
```

## Docker / Unraid

One image with the backend and the built frontend, port `8080`, data in the `/data` volume.

```bash
podman build --format docker -t is-it-worth-it:latest .     # or: docker build -t is-it-worth-it:latest .
podman run --rm -p 8080:8080 -v ./compose-data:/data:Z is-it-worth-it:latest   # or: docker compose up --build
```

Environment variables: `ALLOWED_NETWORKS` (comma-separated source networks, default = private ranges; loopback is
always allowed), `RAWG_API_KEY`, `TZ` (default `Europe/Berlin`), `PUID`/`PGID` (owner of `/data`, default 99/100).

**Unraid** (image built locally, no registry):

1. Once: copy `unraid/is-it-worth-it.xml` to `/boot/config/plugins/dockerMan/templates-user/my-is-it-worth-it.xml` and
   set up SSH key login to Unraid.
2. `UNRAID_HOST=root@<unraid-ip> scripts/deploy.sh` builds the image (version from `backend/pyproject.toml`) and loads it
   on Unraid as `is-it-worth-it:<version>` and `:latest`.
3. First time: *Docker → Add Container →* template `is-it-worth-it`, set *Allowed networks* (LAN + WireGuard subnet).
   Updates: *Edit → Apply* recreates the container with the new image (a restart would keep the old one).

Rollback: `docker tag is-it-worth-it:<old version> is-it-worth-it:latest` on Unraid, then *Edit → Apply*.
