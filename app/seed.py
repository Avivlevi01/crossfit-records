"""The default exercise list. Safe to run on every start: it only adds what is missing."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Exercise, ExerciseKind

W, R, T, D = (
    ExerciseKind.WEIGHT_REPS,
    ExerciseKind.REPS_ONLY,
    ExerciseKind.TIME,
    ExerciseKind.DISTANCE_TIME,
)

# (category, name, kind)
DEFAULT_EXERCISES: list[tuple[str, str, ExerciseKind]] = [
    # Strength
    ("Strength", "Back Squat", W),
    ("Strength", "Front Squat", W),
    ("Strength", "Overhead Squat", W),
    ("Strength", "Deadlift", W),
    ("Strength", "Bench Press", W),
    ("Strength", "Shoulder Press", W),
    ("Strength", "Push Press", W),
    ("Strength", "Push Jerk", W),
    # Olympic lifts
    ("Olympic lifts", "Clean", W),
    ("Olympic lifts", "Power Clean", W),
    ("Olympic lifts", "Clean & Jerk", W),
    ("Olympic lifts", "Snatch", W),
    ("Olympic lifts", "Power Snatch", W),
    ("Olympic lifts", "Thruster", W),
    # Gymnastics (bodyweight, count reps)
    ("Gymnastics", "Pull-ups", R),
    ("Gymnastics", "Muscle-ups", R),
    ("Gymnastics", "Handstand Push-ups", R),
    ("Gymnastics", "Toes to Bar", R),
    # Benchmark WODs (for time)
    ("Benchmark WODs", "Fran", T),
    ("Benchmark WODs", "Grace", T),
    ("Benchmark WODs", "Helen", T),
    ("Benchmark WODs", "Karen", T),
    ("Benchmark WODs", "Murph", T),
    # Endurance: fixed distances are logged by time, "any distance" by distance + time
    ("Endurance", "Run 400 m", T),
    ("Endurance", "Run 1 km", T),
    ("Endurance", "Run 5 km", T),
    ("Endurance", "Row 500 m", T),
    ("Endurance", "Row 2000 m", T),
    ("Endurance", "Run (any distance)", D),
    # Hyrox stations (for time)
    ("Hyrox", "Hyrox SkiErg 1 km", T),
    ("Hyrox", "Hyrox Sled Push", T),
    ("Hyrox", "Hyrox Sled Pull", T),
    ("Hyrox", "Hyrox Burpee Broad Jumps", T),
    ("Hyrox", "Hyrox Row 1 km", T),
    ("Hyrox", "Hyrox Farmers Carry", T),
    ("Hyrox", "Hyrox Sandbag Lunges", T),
    ("Hyrox", "Hyrox Wall Balls", T),
    ("Hyrox", "Hyrox Full Race", T),
]


def seed_default_exercises(db: Session) -> int:
    existing = {n for n in db.scalars(select(func.lower(Exercise.name)))}
    added = 0
    for category, name, kind in DEFAULT_EXERCISES:
        if name.lower() in existing:
            continue
        db.add(Exercise(name=name, category=category, kind=kind.value, is_default=True))
        added += 1
    db.commit()
    return added
