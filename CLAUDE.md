# CLAUDE.md

Owner: Aviv (junior developer, writes Hebrew; reply in Hebrew, explain in simple terms what each part does).

## Product decisions (agreed 2026-11-19)

- CrossFit personal-records site for Aviv and friends, online 24/7, mobile-first. Weights in KG only.
- Stack: Python FastAPI (REST) + PostgreSQL (SQLAlchemy 2, Alembic) + plain HTML/CSS/JS front-end served by FastAPI. Docker Compose locally; budget 0-20 NIS/month; hosting chosen at phase 7 (leaning small VPS + Docker Compose).
- Auth: username + password (argon2 hash), httpOnly cookie. Registration needs a shared INVITE_CODE. Password reset is manual by the owner (no email).
- Visibility: only logged-in users can view others' tables (read-only). Only the owner edits their own records.
- Comments: show author; deletable by the author and by the record's owner.
- Full history of every record; PR computed from history; estimated 1RM via Epley (computed, not stored).
- Exercise kinds: weight_reps, reps_only, time, distance_time (build in phases; MVP = weight_reps/reps_only). Default exercise list is seeded and cannot be deleted by users; users may add their own.
- Features: PR celebration, progress chart, per-exercise leaderboard, timer (stopwatch/AMRAP/EMOM/Tabata).
- UI: Hebrew (RTL) + English toggle, dark by default, subtle animation everywhere, dramatic only on a new PR. Logo: panda looking at the sea at sunset, SVG.

## Plan (stages)

1 Infrastructure (done when Compose + health work) -> 2 MVP (auth, exercises, records CRUD, view others, comments, basic UI + logo) -> 3 PR/1RM/chart/celebration -> 4 leaderboard -> 5 WOD + run types -> 6 timer -> 7 deploy + backups -> 8 polish.
Wait for the owner's go-ahead between stages.

## Conventions

- Never commit `.env`. Do not create a GitHub repo or push anywhere without asking (this project has no remote yet).
- Schema changes go through Alembic migrations.
