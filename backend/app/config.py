import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DATA_DIR / 'app.db'}")

# Built web frontend (Vite output). In the Docker image it is copied next to the app.
FRONTEND_DIR = Path(os.environ.get("FRONTEND_DIR", Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"))

# External services (outbound only). Without RAWG_API_KEY, metadata lookups are disabled.
RAWG_API_KEY = os.environ.get("RAWG_API_KEY", "")
RAWG_BASE_URL = os.environ.get("RAWG_BASE_URL", "https://api.rawg.io/api")
STEAM_STORE_URL = os.environ.get("STEAM_STORE_URL", "https://store.steampowered.com")

# Source addresses the server answers (see app/netguard.py); loopback is always allowed.
ALLOWED_NETWORKS = os.environ.get("ALLOWED_NETWORKS", "")
