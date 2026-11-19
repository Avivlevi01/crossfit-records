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

1 Infrastructure (DONE) -> 2 MVP: auth, exercises, records CRUD, view others, comments, basic UI + logo (DONE 2026-11-19) -> 3 PR/1RM/chart/celebration -> 4 leaderboard -> 5 polish WOD/run display (forms already handle all 4 kinds) -> 6 timer -> 7 deploy + backups -> 8 polish.
Wait for the owner's go-ahead between stages.

## Decisions made while building stage 2

- Custom exercises are shared with everyone (needed for leaderboards). Names are unique ignoring case across defaults + custom. Creator may delete a custom exercise only while it has no records. Defaults can't be deleted.
- Default list tweaks vs. the original proposal: Cindy replaced by Karen (Cindy is an AMRAP, not "for time"); fixed-distance runs/rows are kind `time`; one generic "Run (any distance)" uses `distance_time`; Hyrox Sled Pull added.
- Login = JWT in httpOnly SameSite=Lax cookie; token embeds a fingerprint of the password hash, so changing a password (`python -m app.admin set-password <user>`) logs out old sessions. Failed-login/invite limits are in-memory (app/ratelimit.py): in production behind a proxy, run uvicorn with `--proxy-headers` so the real client IP is used.
- CSP is `default-src 'self'`: no inline scripts/styles and no external fonts/CDNs. Keep JS/CSS in files; set dynamic styles via `el.style`. /docs is exempt (loads Swagger from a CDN); consider disabling /docs in production.
- Front-end builds DOM with `h()` (text only, never innerHTML with user data). Mixed Hebrew/number lines (e.g. "102.5 kg x 3") wrap the unit in a Unicode isolate (`unit()` in app.js), otherwise the order scrambles in RTL.
- Impact font has one weight: `font-synthesis-weight: none` on html avoids blobby fake bold.
- Tests: `docker compose run --rm app pytest -q` (25 tests, use a throw-away `crossfit_test` DB). Run after backend changes.

## Conventions

- Never commit `.env`. Do not create a GitHub repo or push anywhere without asking (this project has no remote yet).
- Schema changes go through Alembic migrations.
