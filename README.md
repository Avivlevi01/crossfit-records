# CrossFit Records

Personal-records tracker for a group of friends. FastAPI + PostgreSQL + plain HTML/CSS/JS.

## Run locally

Requires Docker Desktop.

```bash
cp .env.example .env     # then edit the values (a dev .env is fine locally)
docker compose up --build
```

- App: http://localhost:8000
- API docs (auto-generated): http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

Migrations run automatically on start (`alembic upgrade head`) and the default exercise list is seeded.
Friends register with the `INVITE_CODE` from `.env`.

## Tests

```bash
docker compose run --rm app pytest -q
```

## Owner commands

```bash
docker compose exec app python -m app.admin list-users
docker compose exec app python -m app.admin set-password <username>   # reset a forgotten password
```

## Changing the database

After editing `app/models.py`:

```bash
docker compose run --rm app alembic revision --autogenerate -m "describe the change"
docker compose up -d --force-recreate app     # applies it
```

## Layout

- `app/` - FastAPI code: `main.py`, `models.py`, `schemas.py`, `security.py`, `routers/` (auth, exercises, records+comments)
- `alembic/` - database migrations
- `static/` - the front-end (`index.html`, `css/`, `js/`, `logo.svg`)
- `tests/` - API tests (permissions, validation, login limits)
