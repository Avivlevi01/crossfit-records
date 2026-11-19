import pytest
from pydantic import ValidationError

from app.config import Settings

GOOD = dict(
    database_url="postgresql+psycopg://u:realpassword@db:5432/x",
    secret_key="k" * 40,
    invite_code="a-real-code-4711",
)


def make(**over):
    return Settings(_env_file=None, **{**GOOD, **over})


def test_production_refuses_example_values():
    with pytest.raises(ValidationError):
        make(cookie_secure=True, secret_key="CHANGE-ME-" + "x" * 30)
    with pytest.raises(ValidationError):
        make(cookie_secure=True, invite_code="CHANGE-ME-a-code")
    with pytest.raises(ValidationError):
        make(cookie_secure=True, database_url="postgresql+psycopg://u:CHANGE-ME@db/x")


def test_production_accepts_real_values_and_dev_is_not_strict():
    assert make(cookie_secure=True).cookie_secure is True
    assert make(secret_key="change-me-" + "x" * 30).cookie_secure is False  # local dev may use placeholders


def test_short_secret_key_is_rejected():
    with pytest.raises(ValidationError):
        make(secret_key="short")


def test_api_docs_are_off_unless_enabled(monkeypatch):
    monkeypatch.delenv("ENABLE_DOCS", raising=False)  # the dev container turns them on via its environment
    monkeypatch.delenv("COOKIE_SECURE", raising=False)
    assert make().enable_docs is False
    assert make(enable_docs=True).enable_docs is True
