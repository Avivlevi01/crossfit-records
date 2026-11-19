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

Migrations run automatically on start (`alembic upgrade head`).

## Changing the database

After editing `app/models.py`:

```bash
docker compose exec app alembic revision --autogenerate -m "describe the change"
docker compose exec app alembic upgrade head
```

## Layout

- `app/` - FastAPI code (`main.py`, `models.py`, `config.py`, `database.py`)
- `alembic/` - database migrations
- `static/` - the front-end
