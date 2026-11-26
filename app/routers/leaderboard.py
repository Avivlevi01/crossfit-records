"""Who is strongest / fastest? One ranking per exercise, using each person's PR.

The "what is better" rules are the same ones used everywhere else (app/pr.py).
Any logged-in user may look at every leaderboard.
"""

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session, joinedload

from app import pr
from app.database import get_db
from app.deps import get_current_user
from app.models import Exercise, ExerciseKind, Record, User
from app.schemas import ExerciseOut, LeaderboardEntry, LeaderboardExercise, LeaderboardOut, ValueSet

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("", response_model=list[LeaderboardExercise])
def exercises_with_records(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Exercises someone has logged, most popular first (these are the ones worth ranking)."""
    people = func.count(distinct(Record.user_id))
    rows = db.execute(
        select(Exercise, people)
        .join(Record, Record.exercise_id == Exercise.id)
        .group_by(Exercise.id)
        .order_by(people.desc(), Exercise.name)
    ).all()
    return [LeaderboardExercise(exercise=ExerciseOut.model_validate(e), participants=n) for e, n in rows]


@router.get("/{exercise_id}", response_model=LeaderboardOut)
def leaderboard(exercise_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(404, "Exercise not found")

    records = db.scalars(
        select(Record).where(Record.exercise_id == exercise_id).options(joinedload(Record.user))
    ).all()
    by_user: dict[int, list[Record]] = defaultdict(list)
    for r in records:
        by_user[r.user_id].append(r)
    # Each person is represented by their PR (their best ever, not their latest).
    bests = [pr.best_record(exercise.kind, rs) for rs in by_user.values()]

    # Best first. Equal PRs: whoever got there first is listed first.
    bests.sort(key=lambda r: (r.performed_on, r.user.username.lower()))
    bests.sort(key=lambda r: pr.score(exercise.kind, r), reverse=True)

    entries: list[LeaderboardEntry] = []
    rank, previous_score = 0, None
    for position, r in enumerate(bests, start=1):
        score = pr.score(exercise.kind, r)
        if score != previous_score:  # equal scores share a rank (1, 1, 3...)
            rank, previous_score = position, score
        entries.append(
            LeaderboardEntry(
                **ValueSet.from_record(r).model_dump(),
                rank=rank,
                user_id=r.user_id,
                username=r.user.username,
                performed_on=r.performed_on,
                est_1rm=(
                    pr.est_1rm(r.weight_kg, r.reps)
                    if exercise.kind == ExerciseKind.WEIGHT_REPS.value
                    else None
                ),
            )
        )
    return LeaderboardOut(exercise=ExerciseOut.model_validate(exercise), entries=entries)
