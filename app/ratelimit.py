"""Tiny in-memory limiter for failed attempts (wrong password / wrong invite code).

Good enough for one server process and a small group of friends. It resets when the
app restarts; if the site ever runs on several servers this should move to the database.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.config import settings


class FailureLimiter:
    def __init__(self, max_failures: int, window_seconds: int):
        self.max_failures = max_failures
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _recent(self, key: str) -> deque[float]:
        hits = self._hits[key]
        cutoff = time.monotonic() - self.window
        while hits and hits[0] < cutoff:
            hits.popleft()
        if not hits:
            self._hits.pop(key, None)
            return deque()
        return hits

    def check(self, key: str) -> None:
        if len(self._recent(key)) >= self.max_failures:
            raise HTTPException(429, "Too many failed attempts. Try again in a few minutes.")

    def record_failure(self, key: str) -> None:
        if len(self._hits) > 10_000:  # keep memory bounded
            for k in list(self._hits):
                self._recent(k)
        self._hits[key].append(time.monotonic())

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)

    def clear(self) -> None:
        self._hits.clear()


login_by_ip = FailureLimiter(max_failures=10, window_seconds=15 * 60)
login_by_user = FailureLimiter(max_failures=8, window_seconds=15 * 60)
invite_by_ip = FailureLimiter(max_failures=8, window_seconds=15 * 60)


def client_ip(request: Request) -> str:
    """The visitor's address. Behind N trusted proxies each one appends the address it saw to
    X-Forwarded-For, so the real visitor is the Nth entry from the RIGHT. Anything further left
    was typed by the visitor and can be forged, so it is never used."""
    hops = settings.trusted_proxy_hops
    if hops > 0:
        parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return request.client.host if request.client else "unknown"
