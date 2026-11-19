"""Database tables.

users      - people who registered
exercises  - the default list + exercises users add themselves
records    - every single attempt (full history); the "PR" is computed from these
comments   - notes on a record, each with its author
"""

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ExerciseKind(str, enum.Enum):
    """What an exercise measures. Decides which record fields are used."""

    WEIGHT_REPS = "weight_reps"      # Back Squat: weight_kg + reps
    REPS_ONLY = "reps_only"          # Pull-ups: reps (no external weight)
    TIME = "time"                    # Fran, Murph: time_seconds
    DISTANCE_TIME = "distance_time"  # 5K run: distance_m + time_seconds


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(32))
    password_hash: Mapped[str] = mapped_column(String(255))  # never the plain password
    is_admin: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    records: Mapped[list["Record"]] = relationship(back_populates="user", cascade="all, delete-orphan")


# Usernames are unique ignoring case ("Aviv" and "aviv" are the same person).
Index("ix_users_username_lower", func.lower(User.username), unique=True)


class Exercise(Base):
    __tablename__ = "exercises"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('weight_reps', 'reps_only', 'time', 'distance_time')",
            name="ck_exercises_kind",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(40))  # e.g. "Olympic lifts", "Hyrox"
    kind: Mapped[str] = mapped_column(String(20), default=ExerciseKind.WEIGHT_REPS.value)
    is_default: Mapped[bool] = mapped_column(default=False)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# Exercise names are unique ignoring case (defaults and custom ones share one namespace).
Index("ix_exercises_name_lower", func.lower(Exercise.name), unique=True)


class Record(Base):
    __tablename__ = "records"
    __table_args__ = (
        CheckConstraint("weight_kg IS NULL OR weight_kg >= 0", name="ck_records_weight"),
        CheckConstraint("reps IS NULL OR reps > 0", name="ck_records_reps"),
        CheckConstraint("time_seconds IS NULL OR time_seconds > 0", name="ck_records_time"),
        CheckConstraint("distance_m IS NULL OR distance_m > 0", name="ck_records_distance"),
        Index("ix_records_user_exercise_date", "user_id", "exercise_id", "performed_on"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="RESTRICT"))
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))  # KG only
    reps: Mapped[int | None]
    time_seconds: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))
    distance_m: Mapped[int | None]
    performed_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="records")
    exercise: Mapped[Exercise] = relationship()
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="record", cascade="all, delete-orphan", order_by="Comment.created_at"
    )


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    record_id: Mapped[int] = mapped_column(ForeignKey("records.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    record: Mapped[Record] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()
