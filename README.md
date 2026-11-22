<div align="center">

<img src="static/logo.svg" alt="CrossFit Records logo" width="120">

# CROSSFIT **RECORDS**

**A private personal-records tracker for a group of friends.**
Log every lift and benchmark, watch your progress, and see who is leading the board.

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Cloud Run](https://img.shields.io/badge/Google_Cloud_Run-4285F4?logo=googlecloud&logoColor=white)
![Languages](https://img.shields.io/badge/UI-English_%7C_%D7%A2%D7%91%D7%A8%D7%99%D7%AA-FF5A2C)

<br>

<img src="docs/screenshots/my-records.png" alt="My records" width="19%">
<img src="docs/screenshots/chart.png" alt="Progress chart" width="19%">
<img src="docs/screenshots/leaderboard.png" alt="Leaderboard" width="19%">
<img src="docs/screenshots/timer.png" alt="Workout timer" width="19%">
<img src="docs/screenshots/leaderboard-hebrew.png" alt="Hebrew right-to-left UI" width="19%">

<sub>Demo data. The app is mobile-first, dark, and fully bilingual (English / Hebrew with right-to-left layout).</sub>

</div>

---

## ✨ What it does

| | |
|---|---|
| 🏋️ **Log records** | Weight × reps, reps only, time (Fran, Murph...) or distance + time. 38 default exercises, and you can add your own. |
| 📈 **Progress charts** | Every attempt is kept. The chart shows the trend and marks new personal records in gold. |
| 🧮 **Estimated 1RM** | Calculated from weight and reps (Epley formula), so a 3-rep set can be compared with a 5-rep set. |
| 🏆 **Leaderboard** | Per exercise, with your rank and how much you need to pass the next person. |
| 💬 **Comments** | Friends can react to a record. Only the owner can edit or delete their own records. |
| ⏱️ **Workout timer** | Stopwatch, AMRAP, EMOM and Tabata, with sound and a get-ready countdown. |
| 🎉 **PR celebration** | A short celebration when you beat your previous best. |
| 🔒 **Invite-only** | Registration needs a shared invite code. Passwords are hashed with Argon2. |

<details>
<summary><b>More screens</b></summary>
<br>
<div align="center">
<img src="docs/screenshots/login.png" alt="Login" width="24%">
<img src="docs/screenshots/new-record.png" alt="New record" width="24%">
<img src="docs/screenshots/friends.png" alt="Friends" width="24%">
</div>
</details>

---

## 🏗️ Architecture

The app is deliberately simple: **one container** that serves both the API and the front-end, talking to **one PostgreSQL database**. Everything else (HTTPS, scaling, deploys) is handled by the platform.

```mermaid
flowchart LR
    U["📱 Browser<br/>plain HTML / CSS / JS"] -- "HTTPS" --> CR

    subgraph GCP ["☁️ Google Cloud Run (europe-west1)"]
        CR["🐳 One container<br/>FastAPI + static files<br/>0 to 1 instances"]
    end

    CR -- "SQL over TLS" --> DB[("🐘 Neon PostgreSQL<br/>users, exercises,<br/>records, comments")]

    GH["🐙 GitHub<br/>push to main"] -- "Cloud Build trigger" --> CB["🏗️ Cloud Build<br/>build image from Dockerfile"]
    CB -- "deploy new revision" --> CR
```

### Why it is built this way

| Decision | Why | What we gave up |
|---|---|---|
| **FastAPI + Pydantic** | Types become validation and automatic API docs. Small and fast to write. | Fewer batteries than Django. |
| **Plain HTML/CSS/JS (no framework, no build step)** | Nothing to compile, tiny payload, and the whole front-end is readable in an afternoon. | More manual DOM code. |
| **PostgreSQL, not SQLite** | Real constraints and concurrent writers, and the same engine locally and in production. | A separate service to run. |
| **Database apart from the app** | The container is stateless and can be replaced or restarted at any time. Only the database holds data. | One more thing to secure and back up. |
| **Docker (multi-stage)** | Identical environment on a laptop and in the cloud. The production image runs as a non-root user. | Needs Docker to develop. |
| **Cloud Run + Neon** | Scales to zero, so a hobby app costs close to nothing. HTTPS is included. | A cold start of a few seconds after idle. Free tiers can change. |
| **Push to deploy** | Every push to `main` builds and releases by itself. | The pipeline does not run the tests yet. |

### Data model

```mermaid
erDiagram
    USERS ||--o{ RECORDS : logs
    EXERCISES ||--o{ RECORDS : "is measured in"
    RECORDS ||--o{ COMMENTS : has
    USERS ||--o{ COMMENTS : writes
    USERS ||--o{ EXERCISES : "creates (custom)"

    USERS {
        int id PK
        string username "unique, case-insensitive"
        string password_hash "Argon2"
        bool is_admin
    }
    EXERCISES {
        int id PK
        string name "unique, case-insensitive"
        string category
        string kind "weight_reps, reps_only, time, distance_time"
    }
    RECORDS {
        int id PK
        decimal weight_kg
        int reps
        decimal time_seconds
        int distance_m
        date performed_on
    }
    COMMENTS {
        int id PK
        text body
    }
```

`kind` decides which fields of a record are used, so one table handles squats, pull-ups, Fran and a 5K run. Database `CHECK` constraints back up the API validation.

### What happens when you save a record

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as FastAPI
    participant D as PostgreSQL
    B->>A: POST /api/records (cookie + JSON)
    A->>A: verify cookie, validate fields
    A->>D: INSERT record
    A->>D: read earlier records of this exercise
    A->>A: compare, is it a new PR?
    A-->>B: 201 saved + celebration info
    B->>B: toast, gold PR badge, chart refresh
```

### Security in short

- **Passwords**: hashed with Argon2, never stored in plain text. A password change invalidates old sessions (the cookie carries a fingerprint of the hash).
- **Session**: JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production), so scripts on the page cannot read it.
- **Brute force**: wrong passwords and wrong invite codes are rate-limited per client IP (and per username for logins). The limiter is in memory, which fits a single instance. Behind a proxy the real IP is the Nth entry from the **right** of `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`), because the left side can be forged.
- **Headers**: strict CSP (`default-src 'self'`), HSTS, `X-Frame-Options`, `nosniff`, and `no-store` on API responses.
- **Authorization**: any logged-in user may read; only the owner may change their own records. Covered by tests.
- **Secrets** (database URL, signing key, invite code) live only in the platform's environment settings, never in the repo.

---

## 🚀 Run it locally

Requires **Docker Desktop**.

```bash
cp .env.example .env          # edit the values (a dev .env is fine locally)
docker compose up --build
```

| | |
|---|---|
| App | http://localhost:8000 |
| API docs (development only, `ENABLE_DOCS=true`) | http://localhost:8000/docs |
| Health check | http://localhost:8000/api/health |

Migrations run automatically on start (`alembic upgrade head`) and the default exercises are seeded. Friends register with the `INVITE_CODE` from `.env`.

## ✅ Tests

```bash
docker compose run --rm app pytest -q          # API: permissions, validation, login limits, PR logic
node --test "tests/js/*.test.mjs"              # timer logic (Node 22+, nothing to install)
```

## ☁️ Deployment

The live setup is **Google Cloud Run + Neon**, deployed by a Cloud Build trigger on every push to `main`. The container reads `$PORT`, rewrites Neon's `postgresql://` URL for the driver, and runs migrations on start.

Alternative: a single VPS with `docker-compose.prod.yml` (app + PostgreSQL + Caddy with automatic HTTPS). Step by step in [DEPLOY.md](DEPLOY.md) (Hebrew).

### Backups

```bash
./scripts/backup-neon.sh                                  # writes backups/neon-<date>.sql.gz
./scripts/restore-neon.sh backups/neon-<date>.sql.gz      # replaces the target database
```

Docker is the only requirement. The connection string is typed hidden (or passed through `NEON_DATABASE_URL`) and never written to disk. For the VPS stack use `scripts/backup.sh` / `restore.sh`.

## 🧰 Owner commands

```bash
docker compose exec app python -m app.admin list-users
docker compose exec app python -m app.admin set-password <username>   # reset a forgotten password
```

## 🗄️ Changing the database

After editing `app/models.py`:

```bash
docker compose run --rm app alembic revision --autogenerate -m "describe the change"
docker compose up -d --force-recreate app     # applies it
```

## 📁 Project layout

```
app/            FastAPI code
  main.py         app factory, security headers, static files
  models.py       SQLAlchemy models
  schemas.py      Pydantic request/response models
  security.py     password hashing, JWT cookie
  ratelimit.py    login/invite limiter, client-IP logic
  pr.py           personal-record and 1RM logic
  routers/        auth, exercises, records + comments, leaderboard
alembic/        database migrations
static/         front-end: index.html, css/, js/ (i18n, chart, timer...), logo.svg
tests/          pytest API tests + Node timer tests
scripts/        backup / restore (VPS and Neon)
docs/           README screenshots
```

---

<details>
<summary><b>🇮🇱 תקציר בעברית</b></summary>
<br>

<div dir="rtl">

**שיאים בקרוספיט** הוא אתר פרטי לחברים: רושמים שיאים (משקל, חזרות, זמן, מרחק), רואים גרף התקדמות, טבלת דירוג לכל תרגיל, תגובות וטיימר אימון. הממשק בעברית ובאנגלית, מותאם לטלפון.

**ארכיטקטורה:** קונטיינר אחד (FastAPI שמגיש גם את ה-API וגם את הדפים) שמדבר עם מסד PostgreSQL אחד. האתר רץ ב-Google Cloud Run, המסד ב-Neon, וכל `push` ל-`main` בונה ומעלה גרסה חדשה לבד. ההרשמה בקוד הזמנה, והסיסמאות נשמרות מוצפנות (Argon2).

**הרצה מקומית:** `docker compose up --build`, ואז http://localhost:8000. **גיבוי:** `./scripts/backup-neon.sh`. מדריך העלאה מפורט ב-[DEPLOY.md](DEPLOY.md).

</div>

</details>
