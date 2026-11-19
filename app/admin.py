"""Owner's maintenance commands (run inside the app container).

  docker compose exec app python -m app.admin list-users
  docker compose exec app python -m app.admin set-password <username>

set-password is how you reset a friend's forgotten password. It also logs out
all of that user's existing sessions.
"""

import getpass
import sys

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import Record, User
from app.security import hash_password


def list_users() -> None:
    with SessionLocal() as db:
        rows = db.execute(
            select(User.username, User.created_at, func.count(Record.id))
            .outerjoin(Record, Record.user_id == User.id)
            .group_by(User.id)
            .order_by(User.id)
        ).all()
    for username, created, n in rows:
        print(f"{username:<20} joined {created:%Y-%m-%d}  records: {n}")


def set_password(username: str) -> None:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(func.lower(User.username) == username.lower()))
        if user is None:
            sys.exit(f"No such user: {username}")
        password = getpass.getpass("New password (min 8 chars): ")
        if len(password) < 8:
            sys.exit("Password too short.")
        if getpass.getpass("Repeat: ") != password:
            sys.exit("Passwords differ.")
        user.password_hash = hash_password(password)
        db.commit()
    print(f"Password updated for {user.username}.")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["list-users"]:
        list_users()
    elif len(args) == 2 and args[0] == "set-password":
        set_password(args[1])
    else:
        sys.exit(__doc__)
