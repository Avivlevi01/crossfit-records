from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.routers import auth, exercises, leaderboard, records
from app.seed import seed_default_exercises


@asynccontextmanager
async def lifespan(_: FastAPI):
    with SessionLocal() as db:
        seed_default_exercises(db)  # adds the default exercise list if missing
    yield


app = FastAPI(
    title="CrossFit Records",
    lifespan=lifespan,
    # The docs page advertises every endpoint: handy while developing, pointless to expose publicly.
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
)

app.include_router(auth.router)
app.include_router(exercises.router)
app.include_router(records.router)
app.include_router(leaderboard.router)


@app.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict:
    """Used by hosting services to check the app and its database are alive."""
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    # Only our own scripts/styles/images may load: blocks injected third-party code.
    # (The API docs page loads Swagger from a CDN, so it is exempt.)
    if not request.url.path.startswith(("/docs", "/redoc")):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
        )
    if settings.cookie_secure:  # i.e. production over HTTPS: tell browsers to never use plain HTTP
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


# The front-end (plain HTML/CSS/JS). Mounted last so /api/* routes win.
app.mount("/", StaticFiles(directory="static", html=True), name="static")
