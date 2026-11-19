"""Shapes of the JSON the API accepts and returns (validated automatically by FastAPI)."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models import ExerciseKind

USERNAME_PATTERN = r"^[\w.\-]{3,32}$"  # letters (incl. Hebrew), digits, _ . -
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)]


class RegisterIn(BaseModel):
    username: str = Field(pattern=USERNAME_PATTERN)
    password: str = Field(min_length=8, max_length=128)
    invite_code: str = Field(max_length=100)


class LoginIn(BaseModel):
    username: str = Field(max_length=32)
    password: str = Field(max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str


class UserListItem(UserOut):
    record_count: int
    last_record_on: date | None


class ExerciseIn(BaseModel):
    name: ShortText
    category: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)] = "Custom"
    kind: ExerciseKind


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    category: str
    kind: ExerciseKind
    is_default: bool
    created_by_id: int | None


class RecordIn(BaseModel):
    exercise_id: int
    weight_kg: float | None = Field(None, ge=0, le=1000)  # KG only
    reps: int | None = Field(None, ge=1, le=10000)
    time_seconds: float | None = Field(None, gt=0, le=172800)
    distance_m: int | None = Field(None, gt=0, le=1_000_000)
    performed_on: date
    note: str | None = Field(None, max_length=500)


class ValueSet(BaseModel):
    """The measured values of a record (used to describe the previous PR)."""

    weight_kg: float | None
    reps: int | None
    time_seconds: float | None
    distance_m: int | None

    @classmethod
    def from_record(cls, r) -> "ValueSet":
        return cls(
            weight_kg=float(r.weight_kg) if r.weight_kg is not None else None,
            reps=r.reps,
            time_seconds=float(r.time_seconds) if r.time_seconds is not None else None,
            distance_m=r.distance_m,
        )


class Celebration(BaseModel):
    """Sent only right after saving a record that is worth celebrating."""

    type: Literal["new", "first"]  # "new" = broke the PR, "first" = first record for the exercise
    previous: ValueSet | None  # the PR that was beaten ("new" only)


class RecordOut(BaseModel):
    id: int
    user_id: int
    username: str
    exercise: ExerciseOut
    weight_kg: float | None
    reps: int | None
    time_seconds: float | None
    distance_m: int | None
    performed_on: date
    note: str | None
    comment_count: int
    est_1rm: float | None  # estimated one-rep max (weight x reps exercises, up to 12 reps)
    is_pr: bool  # beat everything logged before it
    is_current_pr: bool  # holds the PR right now
    celebration: Celebration | None = None


class LeaderboardExercise(BaseModel):
    """An exercise that has at least one record, and how many people have logged it."""

    exercise: ExerciseOut
    participants: int


class LeaderboardEntry(ValueSet):
    """One person's best record (their PR) for the exercise."""

    rank: int  # 1 = best. Equal PRs share a rank (1, 1, 3...)
    user_id: int
    username: str
    performed_on: date
    est_1rm: float | None


class LeaderboardOut(BaseModel):
    exercise: ExerciseOut
    entries: list[LeaderboardEntry]


class CommentIn(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class CommentOut(BaseModel):
    id: int
    record_id: int
    author_id: int
    author_username: str
    body: str
    created_at: datetime
    can_delete: bool  # true if the current user wrote it or owns the record
