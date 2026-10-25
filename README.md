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

Data is stored in `backend/data/app.db` (override with `DATA_DIR`). Migrations run automatically on startup.

Game info and images come from [RAWG](https://rawg.io): get a free API key ("Get API key") and start the backend with
`RAWG_API_KEY=<your key>`. Without a key everything works, just without metadata lookups. The DLC list with prices comes
from the public Steam store (no key needed).

Command line tools (run from `backend/`):

```bash
.venv/bin/python -m app.cli import-csv ../test_pc.csv --category PC --device "Gaming PC" --store Steam --dry-run
.venv/bin/python -m app.cli export -o backup.json          # add --images for a ZIP with covers/uploads
.venv/bin/python -m app.cli import-json backup.json --mode replace
```

After changing a model, create a migration:

```bash
.venv/bin/python -c "from alembic import command; from app.db import get_engine; from app.migrations import alembic_config; command.revision(alembic_config(get_engine()), message='describe change', autogenerate=True)"
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
