# Is It Worth It?

Self-hosted tracker for games and gaming/PC hardware: purchases (copies, DLC, bundles), playtime per device,
cost per hour and break-even, journal and wishlist. See [PLANNING.md](PLANNING.md) for the full plan.

## Run locally

Two ways to build and open the app on your own machine. Both serve the web app and the API on one port.

### With a container (same as on Unraid)

Needs Podman (or Docker). Run from the repository root:

```bash
podman build --format docker -t is-it-worth-it:latest .
mkdir -p compose-data
podman run -d --name is-it-worth-it -p 8080:8080 -v ./compose-data:/data:Z is-it-worth-it:latest
```

Open http://127.0.0.1:8080 (use `127.0.0.1`: rootless Podman doesn't forward IPv6, which `localhost` may pick).
Data is kept in `compose-data/`. Add `-e RAWG_API_KEY=<your key>` before the image name for game info and images.

```bash
podman logs -f is-it-worth-it        # logs
podman stop is-it-worth-it           # stop; `podman start is-it-worth-it` starts it again with the same data
```

After changing code, rebuild the image and **recreate** the container (a restart keeps the old image):

```bash
podman build --format docker -t is-it-worth-it:latest .
podman rm -f is-it-worth-it
podman run -d --name is-it-worth-it -p 8080:8080 -v ./compose-data:/data:Z is-it-worth-it:latest
```

### Without a container

Needs Python 3.12+ and Node.js 22. Build the frontend once, then start the backend, which serves it:

```bash
cd frontend && npm install && npm run build && cd ..
cd backend && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --port 8000       # from backend/
```

Open http://127.0.0.1:8000. Data is kept in `backend/data/`. After frontend changes run `npm run build` again and
reload the page; for working on the code, the dev servers below are faster (they reload automatically).

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

Data is stored in `backend/data/app.db` (override with `DATA_DIR`). Migrations run automatically on startup.

Game info and images come from [RAWG](https://rawg.io): get a free API key ("Get API key") and start the backend with
`RAWG_API_KEY=<your key>`. Without a key everything works, just without metadata lookups. The DLC list with prices comes
from the public Steam store (no key needed).

Command line tools (run from `backend/`):

```bash
.venv/bin/python -m app.cli import-csv tests/fixtures/test_pc.csv --category PC --device "Gaming PC" --store Steam --dry-run
.venv/bin/python -m app.cli export -o backup.json          # add --images for a ZIP with covers/uploads
.venv/bin/python -m app.cli import-json backup.json --mode replace
```

**Every model change needs a migration** (a test fails otherwise). Create it from `backend/`, then check the generated
file in `app/alembic/versions/` (SQLite changes run in batch mode; data changes have to be written by hand):

```bash
.venv/bin/python -m app.cli migration "describe change"
```

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

One image with the backend and the built frontend, port `8080`, data in the `/data` volume. Building and running it
locally: see [Run locally](#with-a-container-same-as-on-unraid) (with Docker: `docker compose up --build`).

Environment variables: `ALLOWED_NETWORKS` (comma-separated source networks, default = private ranges; loopback is
always allowed), `RAWG_API_KEY`, `TZ` (default `Europe/Berlin`), `PUID`/`PGID` (owner of `/data`, default 99/100).

**Releases:** every push to `main` runs the tests on GitHub Actions. A version tag also publishes the image to
`ghcr.io/sinanboecker/is-it-worth-it` as `:<version>` and `:latest`:

```bash
scripts/release.sh 0.2.0     # sets the version, commits "Release 0.2.0", tags v0.2.0 and pushes
```

Follow the build under *Actions* on GitHub. The tag must match the version in `backend/pyproject.toml` and
`frontend/package.json`, which `release.sh` takes care of.

### Unraid

**1. Get the template** (once): in the Unraid web UI, open the terminal (`>_` icon, top right) and run

```bash
wget -O /boot/config/plugins/dockerMan/templates-user/my-is-it-worth-it.xml \
  https://raw.githubusercontent.com/sinanboecker/is-it-worth-it/main/unraid/is-it-worth-it.xml
```

`/boot` is the USB stick, so the template survives reboots. Run the command again to pick up template changes.

**2. Apply the template** (create the container):

1. *Docker* tab (enable Docker under *Settings → Docker* if it's missing) → **Add Container** at the bottom.
2. *Template* dropdown at the top → under *User templates* pick **is-it-worth-it**. The form fills in.
3. Check the fields:

   | Field | Value |
   |---|---|
   | Repository | `ghcr.io/sinanboecker/is-it-worth-it:latest` (prefilled) |
   | Network Type | `bridge` (prefilled) |
   | Web UI port | `8080`; if another container uses it, change only this number, e.g. `8085` |
   | Data | `/mnt/user/appdata/is-it-worth-it` (prefilled) |
   | Allowed networks | home network + WireGuard subnet, e.g. `192.168.178.0/24,10.253.0.0/24`; empty = all private ranges |
   | RAWG API key | optional, for game info and images |

   Time zone, PUID and PGID are under *Show more settings*; the defaults fit Unraid.
4. **Apply**: Unraid downloads the image (~225 MB) and starts the container. *Done* when it reports success.
5. Open it via the container icon → *WebUI*, or `http://<unraid-ip>:8080`. The database starts empty; data lives in
   `/mnt/user/appdata/is-it-worth-it`.

To change settings later: container icon → *Edit*, change, *Apply* (recreates the container, data stays).

**Updates:** after a release, *Docker* tab → *Check for Updates* → **Update** on the container ("update ready").
This recreates it with the new image; migrations run on start and the data in `/data` stays.

**Rollback:** in *Edit*, set *Repository* to a fixed version, e.g. `ghcr.io/sinanboecker/is-it-worth-it:0.1.0`, and
*Apply*. Set it back to `:latest` to follow releases again.

**Unreleased build:** `UNRAID_HOST=root@<unraid-ip> scripts/deploy.sh` (needs SSH key login to Unraid) builds locally and
loads it as `:latest`, then *Edit → Apply*. The next *Update* replaces it with the latest release.

## License

[MIT](LICENSE). Game data and images shown in the app come from [RAWG](https://rawg.io) and are subject to its terms.
