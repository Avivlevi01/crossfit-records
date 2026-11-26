def test_health_is_ok(make_client):
    c = make_client()
    r = c.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_login_unknown_user_is_rejected(make_client):
    c = make_client()
    r = c.post("/api/auth/login", json={"username": "nobody", "password": "password123"})
    assert r.status_code == 401
    assert c.get("/api/auth/me").status_code == 401  # and no session was created
