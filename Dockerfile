# Three stages: "base" (runtime packages), "dev" (adds test tools, used on your computer),
# "prod" (the lean, non-root image used on the server). The last stage is the default.

FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /code

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


FROM base AS dev

COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY . .

EXPOSE 8000
# docker-compose.yml overrides this with --reload for local development
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]


FROM base AS prod

# The app runs as an ordinary user, not root: if it is ever compromised it can do less.
RUN useradd --system --create-home --uid 10001 app
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app app ./app
COPY --chown=app:app static ./static
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"

# Applies database migrations, then starts the app. --proxy-headers: the app sits behind the
# Caddy proxy, so the visitor's real IP comes from the X-Forwarded-For header (needed by the
# login rate limit). Safe here because the app is only reachable through the proxy.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --no-server-header"]
