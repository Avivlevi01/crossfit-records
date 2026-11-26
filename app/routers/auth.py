import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import ratelimit
from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import LoginIn, RegisterIn, UserOut
from app.security import (
    DUMMY_HASH,
    clear_session_cookie,
    hash_password,
    set_session_cookie,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _find_user(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.username) == username.lower()))


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = ratelimit.client_ip(request)
    ratelimit.invite_by_ip.check(ip)

    # Check the invite code first, so strangers can't probe which usernames exist.
    if not hmac.compare_digest(data.invite_code.encode(), settings.invite_code.encode()):
        ratelimit.invite_by_ip.record_failure(ip)
        raise HTTPException(403, "Invalid invite code")

    if _find_user(db, data.username):
        raise HTTPException(409, "Username already taken")

    user = User(username=data.username, password_hash=hash_password(data.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two people registering the same name at the same moment
        db.rollback()
        raise HTTPException(409, "Username already taken") from None

    set_session_cookie(response, user.id, user.password_hash)
    return user


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = ratelimit.client_ip(request)
    user_key = data.username.lower()
    ratelimit.login_by_ip.check(ip)
    ratelimit.login_by_user.check(user_key)

    user = _find_user(db, data.username)
    # Always run one password check, even for unknown users (constant-ish time).
    ok = verify_password(user.password_hash if user else DUMMY_HASH, data.password)
    if not user or not ok:
        ratelimit.login_by_ip.record_failure(ip)
        ratelimit.login_by_user.record_failure(user_key)
        raise HTTPException(401, "Wrong username or password")

    ratelimit.login_by_user.reset(user_key)
    set_session_cookie(response, user.id, user.password_hash)
    return user


@router.post("/logout", status_code=204)
def logout(response: Response):
    clear_session_cookie(response)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
