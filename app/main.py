from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

app = FastAPI(title="CrossFit Records")


@app.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict:
    """Used by hosting services to check the app and its database are alive."""
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


# The front-end (plain HTML/CSS/JS). Mounted last so /api/* routes win.
app.mount("/", StaticFiles(directory="static", html=True), name="static")
