"""Users list, records (history of attempts) and comments.

The rule everywhere: any logged-in user may READ; only the owner may CHANGE his own records.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, tuple_
from sqlalchemy.orm import Session, joinedload

from app import pr
from app.database import get_db
from app.deps import get_current_user
from app.models import Comment, Exercise, ExerciseKind, Record, User
from app.schemas import (
    Celebration,
    CommentIn,
    CommentOut,
    ExerciseOut,
    RecordIn,
    RecordOut,
    UserListItem,
    ValueSet,
)

router = APIRouter(prefix="/api", tags=["records"])

# Which fields each kind of exercise needs (everything else must be empty).
REQUIRED_FIELDS = {
    ExerciseKind.WEIGHT_REPS: {"weight_kg", "reps"},
    ExerciseKind.REPS_ONLY: {"reps"},
    ExerciseKind.TIME: {"time_seconds"},
    ExerciseKind.DISTANCE_TIME: {"distance_m", "time_seconds"},
}
ALL_VALUE_FIELDS = {"weight_kg", "reps", "time_seconds", "distance_m"}


def _validate_for_exercise(data: RecordIn, exercise: Exercise) -> None:
    required = REQUIRED_FIELDS[ExerciseKind(exercise.kind)]
    problems = []
    for field in ALL_VALUE_FIELDS:
        has_value = getattr(data, field) is not None
        if field in required and not has_value:
            problems.append(f"{field} is required for {exercise.name}")
        if field not in required and has_value:
            problems.append(f"{field} is not used for {exercise.name}")
    if problems:
        raise HTTPException(422, "; ".join(problems))
    if data.performed_on > datetime.now(timezone.utc).date() + timedelta(days=1):
        raise HTTPException(422, "Date can't be in the future")


def _value_set(r: Record) -> ValueSet:
    return ValueSet(
        weight_kg=float(r.weight_kg) if r.weight_kg is not None else None,
        reps=r.reps,
        time_seconds=float(r.time_seconds) if r.time_seconds is not None else None,
        distance_m=r.distance_m,
    )


def _histories(db: Session, records: list[Record]) -> dict[tuple[int, int], list[Record]]:
    """Full history (all records) of every (user, exercise) pair among `records`.

    PR flags depend on the whole history, so we always look at all of it, even
    when the caller only asked for one record.
    """
    pairs = {(r.user_id, r.exercise_id) for r in records}
    groups: dict[tuple[int, int], list[Record]] = defaultdict(list)
    if pairs:
        rows = db.scalars(select(Record).where(tuple_(Record.user_id, Record.exercise_id).in_(pairs)))
        for row in rows:
            groups[(row.user_id, row.exercise_id)].append(row)
    return groups


def _serialize(db: Session, records: list[Record], saved_id: int | None = None) -> list[RecordOut]:
    """Turns records into API output. Pass `saved_id` right after create/update to
    include the celebration info for that record."""
    ids = [r.id for r in records]
    counts = {}
    if ids:
        counts = dict(
            db.execute(
                select(Comment.record_id, func.count())
                .where(Comment.record_id.in_(ids))
                .group_by(Comment.record_id)
            ).all()
        )
    histories = _histories(db, records)
    kinds = {(r.user_id, r.exercise_id): r.exercise.kind for r in records}
    flags = {key: pr.history_flags(kind, histories[key]) for key, kind in kinds.items()}
    out = []
    for r in records:
        key = (r.user_id, r.exercise_id)
        is_pr, is_current = flags[key][r.id]
        celebration = None
        if saved_id == r.id:
            result = pr.celebration_for(r.exercise.kind, histories[key], r.id)
            if result:
                kind, previous = result
                celebration = Celebration(type=kind, previous=_value_set(previous) if previous else None)
        out.append(
            RecordOut(
                id=r.id,
                user_id=r.user_id,
                username=r.user.username,
                exercise=ExerciseOut.model_validate(r.exercise),
                **_value_set(r).model_dump(),
                performed_on=r.performed_on,
                note=r.note,
                comment_count=counts.get(r.id, 0),
                est_1rm=pr.est_1rm(r.weight_kg, r.reps) if r.exercise.kind == ExerciseKind.WEIGHT_REPS.value else None,
                is_pr=is_pr,
                is_current_pr=is_current,
                celebration=celebration,
            )
        )
    return out


def _load_record(db: Session, record_id: int) -> Record:
    record = db.scalar(
        select(Record)
        .where(Record.id == record_id)
        .options(joinedload(Record.user), joinedload(Record.exercise))
        .execution_options(populate_existing=True)  # re-read, e.g. after the exercise was changed
    )
    if record is None:
        raise HTTPException(404, "Record not found")
    return record


def _apply(record: Record, data: RecordIn) -> None:
    record.exercise_id = data.exercise_id
    record.weight_kg = round(data.weight_kg, 2) if data.weight_kg is not None else None
    record.reps = data.reps
    record.time_seconds = round(data.time_seconds, 2) if data.time_seconds is not None else None
    record.distance_m = data.distance_m
    record.performed_on = data.performed_on
    record.note = (data.note or "").strip() or None


# ---------- users ----------


@router.get("/users", response_model=list[UserListItem])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.execute(
        select(User, func.count(Record.id), func.max(Record.performed_on))
        .outerjoin(Record, Record.user_id == User.id)
        .group_by(User.id)
        .order_by(func.lower(User.username))
    ).all()
    return [
        UserListItem(id=u.id, username=u.username, record_count=n, last_record_on=last)
        for u, n, last in rows
    ]


@router.get("/users/{user_id}/records", response_model=list[RecordOut])
def user_records(
    user_id: int,
    exercise_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if db.get(User, user_id) is None:
        raise HTTPException(404, "User not found")
    query = (
        select(Record)
        .where(Record.user_id == user_id)
        .options(joinedload(Record.user), joinedload(Record.exercise))
        .order_by(Record.performed_on.desc(), Record.id.desc())
    )
    if exercise_id is not None:
        query = query.where(Record.exercise_id == exercise_id)
    return _serialize(db, list(db.scalars(query).all()))


# ---------- records ----------


@router.post("/records", response_model=RecordOut, status_code=201)
def create_record(
    data: RecordIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    exercise = db.get(Exercise, data.exercise_id)
    if exercise is None:
        raise HTTPException(404, "Exercise not found")
    _validate_for_exercise(data, exercise)
    record = Record(user_id=user.id)  # the owner is always the logged-in user, never taken from input
    _apply(record, data)
    db.add(record)
    db.commit()
    return _serialize(db, [_load_record(db, record.id)], saved_id=record.id)[0]


@router.put("/records/{record_id}", response_model=RecordOut)
def update_record(
    record_id: int,
    data: RecordIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = _load_record(db, record_id)
    if record.user_id != user.id:
        raise HTTPException(403, "You can only change your own records")
    exercise = db.get(Exercise, data.exercise_id)
    if exercise is None:
        raise HTTPException(404, "Exercise not found")
    _validate_for_exercise(data, exercise)
    _apply(record, data)
    db.commit()
    return _serialize(db, [_load_record(db, record_id)], saved_id=record_id)[0]


@router.delete("/records/{record_id}", status_code=204)
def delete_record(
    record_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    record = _load_record(db, record_id)
    if record.user_id != user.id:
        raise HTTPException(403, "You can only delete your own records")
    db.delete(record)
    db.commit()


# ---------- comments ----------


def _comment_out(c: Comment, record_owner_id: int, me: User) -> CommentOut:
    return CommentOut(
        id=c.id,
        record_id=c.record_id,
        author_id=c.author_id,
        author_username=c.author.username,
        body=c.body,
        created_at=c.created_at,
        can_delete=me.id in (c.author_id, record_owner_id),
    )


@router.get("/records/{record_id}/comments", response_model=list[CommentOut])
def list_comments(
    record_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    record = _load_record(db, record_id)
    comments = db.scalars(
        select(Comment)
        .where(Comment.record_id == record_id)
        .options(joinedload(Comment.author))
        .order_by(Comment.created_at, Comment.id)
    ).all()
    return [_comment_out(c, record.user_id, user) for c in comments]


@router.post("/records/{record_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(
    record_id: int,
    data: CommentIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = _load_record(db, record_id)
    comment = Comment(record_id=record_id, author_id=user.id, body=data.body)  # author = logged-in user
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _comment_out(comment, record.user_id, user)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(
    comment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(404, "Comment not found")
    record = db.get(Record, comment.record_id)
    if user.id not in (comment.author_id, record.user_id):
        raise HTTPException(403, "Only the comment's author or the record's owner can delete it")
    db.delete(comment)
    db.commit()
