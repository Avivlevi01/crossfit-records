"""Passwords and login sessions.

- Passwords are stored only as argon2 hashes.
- A login is a signed token (JWT) kept in an httpOnly cookie, so page JavaScript can't read it.
- The token also carries a fingerprint of the password hash: changing a password
  (e.g. an admin reset) instantly logs out every old session.
"""

import hashlib
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Response

from app.config import settings

COOKIE_NAME = "session"
SESSION_DAYS = 30

_hasher = PasswordHasher()
# Verified against when a username doesn't exist, so "no such user" and
# "wrong password" take the same time (prevents guessing usernames by timing).
DUMMY_HASH = _hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def _fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def create_session_token(user_id: int, password_hash: str) -> str:
    payload = {
        "sub": str(user_id),
        "pv": _fingerprint(password_hash),
        "exp": datetime.now(UTC) + timedelta(days=SESSION_DAYS),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def read_session_token(token: str) -> tuple[int, str] | None:
    """Returns (user_id, password fingerprint) or None if the token is invalid/expired."""
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        return int(data["sub"]), str(data["pv"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def fingerprint_matches(password_hash: str, fingerprint: str) -> bool:
    return _fingerprint(password_hash) == fingerprint


def set_session_cookie(response: Response, user_id: int, password_hash: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        create_session_token(user_id, password_hash),
        max_age=SESSION_DAYS * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")
