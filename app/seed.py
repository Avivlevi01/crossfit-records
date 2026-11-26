"""The default exercise list. Safe to run on every start: it only adds what is missing."""

from sqlalchemy import select
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


# What the workout is (shown next to the exercise). Standard Rx weights are written men/women.
DESCRIPTIONS: dict[str, str] = {
    "Fran": "21-15-9 reps for time: Thrusters (43/30 kg) and Pull-ups",
    "Grace": "30 Clean & Jerks for time (61/43 kg)",
    "Helen": "3 rounds for time: 400 m run, 21 Kettlebell swings (24/16 kg), 12 Pull-ups",
    "Karen": "150 Wall Balls for time (9/6 kg)",
    "Murph": (
        "For time: 1 mile run, 100 Pull-ups, 200 Push-ups, 300 Air squats, 1 mile run "
        "(optional 9/6 kg vest)"
    ),
    "Run (any distance)": "Log the distance and your time; the pace is calculated for you",
    "Hyrox SkiErg 1 km": "1000 m on the SkiErg",
    "Hyrox Sled Push": "50 m sled push (weight depends on your division)",
    "Hyrox Sled Pull": "50 m sled pull (weight depends on your division)",
    "Hyrox Burpee Broad Jumps": "80 m of burpee broad jumps",
    "Hyrox Row 1 km": "1000 m on the rower",
    "Hyrox Farmers Carry": "200 m farmers carry (weight depends on your division)",
    "Hyrox Sandbag Lunges": "100 m sandbag lunges (weight depends on your division)",
    "Hyrox Wall Balls": "100 Wall Balls (weight depends on your division)",
    "Hyrox Full Race": (
        "8 x 1 km run, each followed by a station: SkiErg, sled push, sled pull, burpee broad "
        "jumps, row, farmers carry, sandbag lunges, wall balls"
    ),
}


def seed_default_exercises(db: Session) -> int:
    """Adds missing default exercises and keeps the descriptions of existing ones up to date."""
    existing = {e.name.lower(): e for e in db.scalars(select(Exercise))}
    added = 0
    for category, name, kind in DEFAULT_EXERCISES:
        found = existing.get(name.lower())
        if found is None:
            db.add(
                Exercise(
                    name=name,
                    category=category,
                    kind=kind.value,
                    is_default=True,
                    description=DESCRIPTIONS.get(name),
                )
            )
            added += 1
        elif found.is_default and found.description != DESCRIPTIONS.get(name):
            found.description = DESCRIPTIONS.get(name)
    db.commit()
    return added
