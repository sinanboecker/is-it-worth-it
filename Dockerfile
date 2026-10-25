# Is It Worth It? One container: FastAPI serves the API under /api and the built web app at /.

# --- web frontend -------------------------------------------------------------
FROM node:22-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx tsc -b && npx vite build

# --- server -------------------------------------------------------------------
FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    FRONTEND_DIR=/app/frontend \
    PUID=99 \
    PGID=100 \
    TZ=Europe/Berlin

# Dependencies from pyproject.toml only; the code itself is copied below and run from /app.
COPY backend/pyproject.toml /tmp/pyproject.toml
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('/tmp/pyproject.toml', 'rb'))['project']['dependencies']))" \
        > /tmp/requirements.txt \
    && pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/pyproject.toml /tmp/requirements.txt

WORKDIR /app
COPY backend/app ./app
COPY --from=frontend /build/dist ./frontend
COPY docker/entrypoint.sh /entrypoint.sh

# shown by Unraid for containers created without the template
LABEL net.unraid.docker.icon="https://raw.githubusercontent.com/sinanboecker/is-it-worth-it/main/unraid/icon.png"

VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/v1/health', timeout=4)"

ENTRYPOINT ["/entrypoint.sh"]
# No proxy headers: the source address must be the real client for ALLOWED_NETWORKS.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-proxy-headers"]
