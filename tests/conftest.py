"""Tests run against a throw-away PostgreSQL database (crossfit_test), never the real one."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app import ratelimit
from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.seed import seed_default_exercises

TEST_DB = "crossfit_test"


@pytest.fixture(scope="session")
def test_engine():
    base_url = make_url(settings.database_url)
    admin = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)"))
        conn.execute(text(f"CREATE DATABASE {TEST_DB}"))
    admin.dispose()
    engine = create_engine(base_url.set(database=TEST_DB))
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(test_engine):
    """Fresh data for every test: wipe the tables, re-seed default exercises."""
    Session = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE comments, records, exercises, users RESTART IDENTITY CASCADE"))
    with Session() as s:
        seed_default_exercises(s)
    yield Session
    ratelimit.login_by_ip.clear()
    ratelimit.login_by_user.clear()
    ratelimit.invite_by_ip.clear()


@pytest.fixture()
def make_client(db_session):
    """make_client() returns a fresh browser-like client (its own cookies)."""

    def override_get_db():
        with db_session() as s:
            yield s

    app.dependency_overrides[get_db] = override_get_db
    clients = []

    def factory() -> TestClient:
        c = TestClient(app)
        clients.append(c)
        return c

    yield factory
    app.dependency_overrides.clear()


def register(client: TestClient, username: str, password: str = "password123"):
    return client.post(
        "/api/auth/register",
        json={"username": username, "password": password, "invite_code": settings.invite_code},
    )


@pytest.fixture()
def user_client(make_client):
    """user_client("aviv") -> a client already registered and logged in as that user."""

    def factory(username: str) -> TestClient:
        c = make_client()
        assert register(c, username).status_code == 201
        return c

    return factory


def exercise_id(client: TestClient, name: str) -> int:
    return next(e["id"] for e in client.get("/api/exercises").json() if e["name"] == name)
