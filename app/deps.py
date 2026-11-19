from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import COOKIE_NAME, fingerprint_matches, read_session_token


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Every protected endpoint depends on this: no valid login cookie -> 401."""
    token = request.cookies.get(COOKIE_NAME)
    parsed = read_session_token(token) if token else None
    if parsed is None:
        raise HTTPException(401, "Not logged in")
    user_id, fingerprint = parsed
    user = db.get(User, user_id)
    if user is None or not fingerprint_matches(user.password_hash, fingerprint):
        raise HTTPException(401, "Not logged in")
    return user
