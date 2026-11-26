from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Exercise, Record, User
from app.schemas import ExerciseIn, ExerciseOut

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


@router.get("", response_model=list[ExerciseOut])
def list_exercises(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.scalars(select(Exercise).order_by(Exercise.category, Exercise.name)).all()


@router.post("", response_model=ExerciseOut, status_code=201)
def create_exercise(
    data: ExerciseIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Anyone can add an exercise; it is then shared with everyone (so leaderboards make sense)."""
    taken = db.scalar(select(Exercise.id).where(func.lower(Exercise.name) == data.name.lower()))
    if taken:
        raise HTTPException(409, "An exercise with this name already exists")
    ex = Exercise(
        name=data.name,
        category=data.category,
        description=data.description or None,
        kind=data.kind.value,
        is_default=False,
        created_by_id=user.id,
    )
    db.add(ex)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An exercise with this name already exists") from None
    return ex


@router.delete("/{exercise_id}", status_code=204)
def delete_exercise(
    exercise_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Only the creator, only custom exercises, only while nobody has logged a record on it."""
    ex = db.get(Exercise, exercise_id)
    if ex is None:
        raise HTTPException(404, "Exercise not found")
    if ex.is_default or ex.created_by_id != user.id:
        raise HTTPException(403, "You can only delete exercises you created")
    in_use = db.scalar(select(func.count()).select_from(Record).where(Record.exercise_id == ex.id))
    if in_use:
        raise HTTPException(409, "This exercise already has records")
    db.delete(ex)
    db.commit()
