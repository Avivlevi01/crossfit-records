"""Hosting adaptations: Neon-style database URLs and the visitor's IP behind a reverse proxy."""

import pytest
from starlette.requests import Request

from app import ratelimit
from app.config import Settings, settings


def make_settings(url: str) -> Settings:
    return Settings(database_url=url, secret_key="x" * 32, invite_code="abcd")


@pytest.mark.parametrize("given", ["postgresql://u:p@h/db?sslmode=require", "postgres://u:p@h/db?sslmode=require"])
def test_hosted_database_urls_get_the_psycopg_driver(given):
    assert make_settings(given).database_url == "postgresql+psycopg://u:p@h/db?sslmode=require"


def test_explicit_driver_is_left_alone():
    url = "postgresql+psycopg://u:p@db:5432/crossfit"
    assert make_settings(url).database_url == url


def fake_request(forwarded: str | None, peer: str = "10.0.0.1") -> Request:
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded else []
    return Request({"type": "http", "headers": headers, "client": (peer, 1234)})


def test_without_trusted_proxies_the_header_is_ignored(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
    assert ratelimit.client_ip(fake_request("6.6.6.6")) == "10.0.0.1"


def test_one_proxy_uses_the_rightmost_entry_so_forged_values_are_ignored(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    assert ratelimit.client_ip(fake_request("1.2.3.4, 203.0.113.9")) == "203.0.113.9"
    assert ratelimit.client_ip(fake_request("203.0.113.9")) == "203.0.113.9"


def test_missing_header_falls_back_to_the_socket(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    assert ratelimit.client_ip(fake_request(None)) == "10.0.0.1"
