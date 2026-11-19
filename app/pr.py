"""Personal-record (PR) rules. One place, so the whole app agrees on what "better" means.

For one user and one exercise, every record gets a "score" (a tuple; bigger is better):

  weight + reps    heaviest weight wins; same weight -> more reps wins
  reps only        most reps
  time             fastest (lowest) time
  distance + time  longest distance; same distance -> faster time

Estimated 1RM (Epley: weight x (1 + reps/30)) is for information only. It is not
shown for sets above 12 reps, because the formula is unreliable there.
"""

from app.models import ExerciseKind, Record

MAX_REPS_FOR_1RM = 12


def est_1rm(weight_kg, reps) -> float | None:
    if not weight_kg or not reps or reps > MAX_REPS_FOR_1RM:
        return None
    weight = float(weight_kg)
    return round(weight if reps == 1 else weight * (1 + reps / 30), 1)


def score(kind: str, r: Record) -> tuple:
    if kind == ExerciseKind.WEIGHT_REPS.value:
        return (float(r.weight_kg), r.reps)
    if kind == ExerciseKind.REPS_ONLY.value:
        return (r.reps,)
    if kind == ExerciseKind.TIME.value:
        return (-float(r.time_seconds),)
    return (r.distance_m, -float(r.time_seconds))  # distance_time


def _chronological(records: list[Record]) -> list[Record]:
    return sorted(records, key=lambda r: (r.performed_on, r.id))


def best_record(kind: str, records: list[Record]) -> Record | None:
    """The record holding the PR (on a tie, the earliest one keeps it)."""
    best = None
    for r in _chronological(records):
        if best is None or score(kind, r) > score(kind, best):
            best = r
    return best


def history_flags(kind: str, records: list[Record]) -> dict[int, tuple[bool, bool]]:
    """record id -> (is_pr, is_current_pr).

    is_pr: it beat everything logged before it (the first record is just the baseline).
    is_current_pr: it is the PR right now.
    """
    current = best_record(kind, records)
    flags: dict[int, tuple[bool, bool]] = {}
    best = None
    for r in _chronological(records):
        s = score(kind, r)
        flags[r.id] = (best is not None and s > best, current is not None and r.id == current.id)
        if best is None or s > best:
            best = s
    return flags


def celebration_for(kind: str, records: list[Record], saved_id: int) -> tuple[str, Record | None] | None:
    """What to celebrate after saving a record.

    ("first", None)   first ever record for this exercise: sets the baseline
    ("new", previous) beats every other record; `previous` held the PR before
    None              tied or not better: nothing to celebrate
    """
    saved = next(r for r in records if r.id == saved_id)
    others = [r for r in records if r.id != saved_id]
    if not others:
        return ("first", None)
    previous = best_record(kind, others)
    if score(kind, saved) > score(kind, previous):
        return ("new", previous)
    return None
