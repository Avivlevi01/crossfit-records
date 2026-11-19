from app.config import settings
from app.models import User
from app.security import hash_password
from tests.conftest import register


def test_register_needs_the_invite_code(make_client):
    c = make_client()
    r = c.post(
        "/api/auth/register",
        json={"username": "aviv", "password": "password123", "invite_code": "wrong"},
    )
    assert r.status_code == 403
    assert c.get("/api/auth/me").status_code == 401


def test_register_logs_you_in(make_client):
    c = make_client()
    assert register(c, "aviv").status_code == 201
    assert c.get("/api/auth/me").json()["username"] == "aviv"


def test_username_is_unique_ignoring_case(make_client):
    register(make_client(), "Aviv")
    assert register(make_client(), "aviv").status_code == 409


def test_short_password_and_bad_username_rejected(make_client):
    c = make_client()
    assert register(c, "aviv", "short").status_code == 422
    assert register(c, "a b", "password123").status_code == 422


def test_hebrew_username_allowed(make_client):
    assert register(make_client(), "אביב").status_code == 201


def test_login_and_wrong_password(make_client):
    register(make_client(), "aviv")
    c = make_client()
    assert c.post("/api/auth/login", json={"username": "aviv", "password": "nope-nope"}).status_code == 401
    ok = c.post("/api/auth/login", json={"username": "AVIV", "password": "password123"})
    assert ok.status_code == 200
    assert c.get("/api/auth/me").status_code == 200


def test_logout(make_client):
    c = make_client()
    register(c, "aviv")
    c.post("/api/auth/logout")
    assert c.get("/api/auth/me").status_code == 401


def test_login_is_rate_limited(make_client):
    register(make_client(), "aviv")
    c = make_client()
    codes = [
        c.post("/api/auth/login", json={"username": "aviv", "password": f"guess-{i}-xx"}).status_code
        for i in range(10)
    ]
    assert codes[:8] == [401] * 8
    assert 429 in codes
    # even the right password is refused while locked
    assert c.post("/api/auth/login", json={"username": "aviv", "password": "password123"}).status_code == 429


def test_invite_guessing_is_rate_limited(make_client):
    c = make_client()
    codes = [
        c.post(
            "/api/auth/register",
            json={"username": f"user{i}", "password": "password123", "invite_code": f"guess{i}"},
        ).status_code
        for i in range(10)
    ]
    assert 429 in codes


def test_api_needs_login(make_client):
    c = make_client()
    for path in ("/api/users", "/api/exercises", "/api/users/1/records"):
        assert c.get(path).status_code == 401


def test_password_change_logs_out_old_sessions(user_client, db_session):
    c = user_client("aviv")
    assert c.get("/api/auth/me").status_code == 200
    with db_session() as s:
        user = s.query(User).filter_by(username="aviv").one()
        user.password_hash = hash_password("brand-new-password")
        s.commit()
    assert c.get("/api/auth/me").status_code == 401


def test_password_is_not_stored_in_plain_text(user_client, db_session):
    user_client("aviv")
    with db_session() as s:
        stored = s.query(User).one().password_hash
    assert "password123" not in stored and stored.startswith("$argon2")
    assert settings.invite_code not in stored
