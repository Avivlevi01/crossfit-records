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

1 Infrastructure (DONE) -> 2 MVP: auth, exercises, records CRUD, view others, comments, basic UI + logo (DONE 2026-11-19) -> 3 PR/1RM/chart/celebration (DONE 2026-11-19) -> 4 leaderboard (DONE 2026-11-19) -> 5 WOD/run polish (DONE 2026-11-19) -> 6 timer (DONE 2026-11-19) -> 7 deploy + backups (PREPARED, awaiting owner's hosting decision) -> 8 polish.
Wait for the owner's go-ahead between stages.

## Decisions made while building stage 2

- Custom exercises are shared with everyone (needed for leaderboards). Names are unique ignoring case across defaults + custom. Creator may delete a custom exercise only while it has no records. Defaults can't be deleted.
- Default list tweaks vs. the original proposal: Cindy replaced by Karen (Cindy is an AMRAP, not "for time"); fixed-distance runs/rows are kind `time`; one generic "Run (any distance)" uses `distance_time`; Hyrox Sled Pull added.
- Login = JWT in httpOnly SameSite=Lax cookie; token embeds a fingerprint of the password hash, so changing a password (`python -m app.admin set-password <user>`) logs out old sessions. Failed-login/invite limits are in-memory (app/ratelimit.py): behind a proxy set `TRUSTED_PROXY_HOPS` (Caddy = 1, Cloud Run = 1): `ratelimit.client_ip` then takes the Nth entry from the RIGHT of X-Forwarded-For (left entries are forgeable). uvicorn's own `--proxy-headers` is no longer used.
- CSP is `default-src 'self'`: no inline scripts/styles and no external fonts/CDNs. Keep JS/CSS in files; set dynamic styles via `el.style`. /docs is exempt (loads Swagger from a CDN); consider disabling /docs in production.
- Front-end builds DOM with `h()` (text only, never innerHTML with user data). Mixed Hebrew/number lines (e.g. "102.5 kg x 3") wrap the unit in a Unicode isolate (`unit()` in app.js), otherwise the order scrambles in RTL.
- Impact font has one weight: `font-synthesis-weight: none` on html avoids blobby fake bold.
- WOD/run polish (stage 5): time is entered as two number boxes (minutes may be >59, seconds 0-59.99) because phone number pads have no ":" key. Distance is entered with a km/m selector (default km; stored as integer meters) and shown as "5.25 km"; distance+time records show pace (min/km) in the entry meta. Exercises have an optional `description` (what the workout is: seeded for Fran/Grace/Helen/Karen/Murph/Hyrox/Run; refreshed on every start by `seed_default_exercises`; custom exercises can set one). Descriptions are English only (dir=auto). Charts: lower-is-better metrics (time, pace) are drawn flipped so an improving line goes up; distance+time charts have distance/time/pace views.
- Timer (stage 6, owner's choices): stopwatch / AMRAP / EMOM / Tabata on tab `#/timer`; beeps + vibration with one mute button (mute silences both; remembered); separate tool, does NOT create records; defaults Tabata 20/10 x 8, EMOM 10 min, AMRAP 12 min, get-ready countdown 10 s (0/5/10/15/30). Code: timer-core.js (pure logic: phases, locate(), cueFor(); unit-tested), timer-audio.js (WebAudio beeps, vibrate, Wake Lock), timer.js (engine + screen). The running timer lives in the module, so it keeps running/beeping when you open other tabs (red dot on the Timer tab); it is stopped on logout. Time comes from performance.now() deltas, not interval counting, so it doesn't drift. Browsers only allow sound after a tap: audio is unlocked inside the Start click. Background tabs may throttle the 100 ms interval to ~1 s, so a beep can be up to a second late when the screen is off (Wake Lock keeps the screen on while running where supported).
- JS tests (Node 22, no dependencies): `node --test "tests/js/*.test.mjs"` (timer logic). Python tests don't cover JS.
- NOT built (ask the owner if wanted): Rx vs Scaled for WODs. Right now scaled and Rx times are compared directly; people can note "scaled" in the note field.
- Tests: `docker compose run --rm app pytest -q` (55 tests, use a throw-away `crossfit_test` DB). Run after backend changes. Test dates must not be in the future (the API rejects dates > tomorrow).

## Stage 7: deployment (prepared 2026-11-19; NOT yet deployed, hosting not chosen)

- Ready and tested locally: multi-stage Dockerfile (`dev` for compose, `prod` = non-root uid 10001, no test tools, healthcheck, `--no-server-header`, port from `$PORT`), `docker-compose.prod.yml` (project `crossfit-prod`; only Caddy publishes ports; `APP_ENV_FILE`/`HTTP_PORT`/`HTTPS_PORT` overridable for local tests), `Caddyfile` (auto HTTPS, `{$DOMAIN}`), `.env.production.example`, `scripts/backup.sh` + `restore.sh` (restore verified: wiped data, restored, login worked), `DEPLOY.md` (Hebrew guide).
- Production safety in code: `COOKIE_SECURE=true` adds HSTS and refuses to start if the settings still contain "change-me" (config.py); `ENABLE_DOCS` (default false) controls /docs and /openapi.json (dev `.env` sets it true); rate limit sees the real IP via Caddy and can't be dodged with a forged X-Forwarded-For (verified).
- **Code adapted for path A (2026-11-22, local, 61 tests pass, prod image tested with PORT=8080):** `DATABASE_URL` may be `postgresql://` or `postgres://` (Neon style, `?sslmode=require` kept; config.py rewrites to `postgresql+psycopg://`), `TRUSTED_PROXY_HOPS` setting (default 0), prod CMD listens on `${PORT:-8000}`, healthcheck follows PORT. Still to do: Neon backup script via pg_dump, decide on running migrations outside container start, Cloud Run deploy (needs the owner's accounts). Owner opened Neon on 2026-11-22: project name `crossfit-records`, region Frankfurt (AWS eu-central-1), only the Postgres service on.
- **Owner chose path A on 2026-11-21: Google Cloud Run + Neon (free Postgres).** Next: code tweaks first, tested locally, no accounts yet (sslmode=require in DATABASE_URL, read the port from env, check client-IP handling behind Google's proxy, max-instances=1 because the rate limiter is in memory, decide whether migrations should run outside container start, secrets as service env vars, backup script for Neon via pg_dump). Owner opens the Neon and Google Cloud accounts (card needed for Google Cloud) and sets a budget alert; Claude guides. Facts from web search, verify on official pages: Neon free = 1 GB/project, 100 CU-hours/month, sleeps after 5 min; Cloud Run free = ~2M requests plus ~240k vCPU-seconds/month (some sources say 180k). Region idea: both in Frankfurt.
- **Google Cloud state (2026-11-22):** owner created project `crossfit-records`, added a payment method and started the $300/90-day free trial (ends about 2027-02-20: then upgrade or move to path C). A budget `crossfit-records_limitation` exists: monthly, spend cap on Cloud Run (3 ILS, raised by the owner to 10 ILS with alerts at 5/8 ILS; edit screen still showed Applies to: Cloud Run in project `My First Project`, id project-65760a20-..., so the dropdown lists only billing-linked projects), alerts 50/80/100%, BUT its scope was set to the auto-created `My First Project`; owner must edit it to `crossfit-records` (and link the project to the billing account if it is not listed). Logs Explorer showed Permission denied (unexplained, recheck after billing is linked). Deck: `google-cloud-billing.html` in crossfit-explainer. Pushed to origin on 2026-11-22 (owner said to push).
- Earlier plan (now the fallback, path C): small Hetzner VPS (~4-5 EUR/mo, verify price) + Docker Compose + a domain (free DuckDNS or ~10 EUR/yr). Needs from the owner before deploying: provider/account, domain choice, private GitHub repo (or manual copy), final INVITE_CODE. Spending money / creating accounts / creating the GitHub repo all need explicit approval.
- Offsite backups are the owner's job (cron + copy `backups/` elsewhere): documented in DEPLOY.md.
- Windows tip: `bash` is not on PowerShell's PATH; run the scripts via Git Bash (the Bash tool).
- LAN access from a phone: use the Wi-Fi adapter's IPv4 (`ipconfig`; 192.168.56.1 is a VirtualBox virtual adapter and won't work from a phone), and Windows Firewall (Public network profile) must allow inbound TCP 8000 (owner runs an admin PowerShell `New-NetFirewallRule`; Claude must not change firewall settings).

## PR rules (stage 3; all in app/pr.py, the single source of truth, reuse it for the leaderboard)

- "Better" per kind: weight_reps = heavier weight, tie -> more reps; reps_only = more reps; time = lower time; distance_time = longer distance, tie -> faster time. On a tie the earliest record keeps the PR.
- Est. 1RM = Epley (`w*(1+reps/30)`, a single = the weight), shown only for <= 12 reps; informational, not used to decide PRs.
- API: every RecordOut has `est_1rm`, `is_pr` (beat everything before it by date; the first record is only a baseline) and `is_current_pr`. Only the POST/PUT response carries `celebration` (`new` = broke the PR, with `previous`; `first` = first record for the exercise; absent for ties/worse).
- UI: gold PR badge on the current PR, per-exercise summary (PR + best 1RM), progress chart (hand-drawn SVG in js/chart.js, gold dots = PR-breaking records), full-screen celebration (js/celebrate.js + CSS, particles disabled under prefers-reduced-motion). "first" record only shows a toast.
- Leaderboard (stage 4): `GET /api/leaderboard` = exercises that have records + participant count (most popular first); `GET /api/leaderboard/{exercise_id}` = one entry per person using their PR (best ever, not latest), sorted best first; ties share a rank (1,1,3) and the earlier PR is listed first. Visible to every logged-in user. UI tab `#/board[/id]`: medals for top 3, banner "rank X of N" + gap to the nearest person ahead (skips people tied with me; text from `improvementText()` in format.js, shared with the celebration), "add a record" shortcut when I have none (dialog preselects the exercise).
- Bidi gotcha (bit us twice): a Hebrew word inside a LTR string reorders the numbers after it. Put date, value and unit in separate isolated pieces (`<bdi>`, `unit()`), never in one `dir=ltr` string.
- The hidden preview pane throttles animations/ResizeObserver: to inspect a finished animation run `document.getAnimations().forEach(a => a.finish())`; charts are drawn explicitly via `box.redraw()` when the panel opens.
- JS layout: app.js (views/router/API), dom.js (h/s/icon), format.js (numbers/time/dates/value text), i18n.js, chart.js, celebrate.js.

## Conventions

- Never commit `.env`. Remote `origin` = https://github.com/Avivlevi01/crossfit-records (private; owner approved the first push 2026-11-21, which merged GitHub's auto-created README commit and kept our README). Ask before pushing again unless the owner says pushes are always OK.
- **Explanations go in a presentation** (owner's request 2026-11-21): whenever the owner asks to understand something, answer with a clear HTML slide deck (frontend-slides skill, Hebrew RTL; deck files live in C:/Users/AvivL/Desktop/crossfit-explainer/, outside this repo), not only text in chat. Decks so far: crossfit-explained.html (overview, 10 slides) and crossfit-path-a.html (path A in depth, 30 slides).
- Schema changes go through Alembic migrations.
