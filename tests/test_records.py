from tests.conftest import exercise_id


def squat(c, **over):
    body = {
        "exercise_id": exercise_id(c, "Back Squat"),
        "weight_kg": 100,
        "reps": 5,
        "performed_on": "2026-11-01",
        "note": "felt good",
    }
    body.update(over)
    return c.post("/api/records", json=body)


def test_default_exercises_exist(user_client):
    c = user_client("aviv")
    names = {e["name"] for e in c.get("/api/exercises").json()}
    assert {"Back Squat", "Clean & Jerk", "Pull-ups", "Fran", "Hyrox Wall Balls"} <= names


def test_create_and_list_own_records(user_client):
    c = user_client("aviv")
    r = squat(c)
    assert r.status_code == 201
    rec = r.json()
    assert rec["weight_kg"] == 100 and rec["reps"] == 5 and rec["username"] == "aviv"
    uid = c.get("/api/auth/me").json()["id"]
    assert [x["id"] for x in c.get(f"/api/users/{uid}/records").json()] == [rec["id"]]


def test_owner_comes_from_login_not_from_input(user_client):
    a, b = user_client("aviv"), user_client("dana")
    a_id = a.get("/api/auth/me").json()["id"]
    r = squat(b, user_id=a_id)  # extra field must be ignored
    assert r.json()["username"] == "dana"


def test_values_must_match_exercise_kind(user_client):
    c = user_client("aviv")
    assert squat(c, reps=None).status_code == 422                       # weight_reps needs reps
    assert squat(c, weight_kg=None).status_code == 422                  # ...and weight
    pullups = exercise_id(c, "Pull-ups")
    base = {"exercise_id": pullups, "performed_on": "2026-11-01"}
    assert c.post("/api/records", json={**base, "reps": 12}).status_code == 201
    assert c.post("/api/records", json={**base, "reps": 12, "weight_kg": 10}).status_code == 422
    fran = exercise_id(c, "Fran")
    run = {"exercise_id": fran, "performed_on": "2026-11-01"}
    assert c.post("/api/records", json={**run, "time_seconds": 245.5}).status_code == 201
    assert c.post("/api/records", json={**run, "reps": 3}).status_code == 422


def test_rejects_bad_numbers_and_future_dates(user_client):
    c = user_client("aviv")
    assert squat(c, weight_kg=-5).status_code == 422
    assert squat(c, reps=0).status_code == 422
    assert squat(c, performed_on="2999-01-01").status_code == 422
    assert squat(c, exercise_id=99999).status_code == 404


def test_others_can_read_but_not_change(user_client):
    a, b = user_client("aviv"), user_client("dana")
    rec = squat(a).json()
    a_id = a.get("/api/auth/me").json()["id"]
    assert len(b.get(f"/api/users/{a_id}/records").json()) == 1        # read-only view works
    edit = {"exercise_id": rec["exercise"]["id"], "weight_kg": 999, "reps": 1, "performed_on": "2026-11-01"}
    assert b.put(f"/api/records/{rec['id']}", json=edit).status_code == 403
    assert b.delete(f"/api/records/{rec['id']}").status_code == 403
    still = a.get(f"/api/users/{a_id}/records").json()[0]
    assert still["weight_kg"] == 100                                    # untouched


def test_owner_can_edit_and_delete(user_client):
    c = user_client("aviv")
    rec = squat(c).json()
    deadlift = exercise_id(c, "Deadlift")
    r = c.put(
        f"/api/records/{rec['id']}",
        json={"exercise_id": deadlift, "weight_kg": 140.5, "reps": 3, "performed_on": "2026-11-02"},
    )
    assert r.status_code == 200
    assert r.json()["exercise"]["name"] == "Deadlift" and r.json()["weight_kg"] == 140.5
    assert c.delete(f"/api/records/{rec['id']}").status_code == 204
    assert c.delete(f"/api/records/{rec['id']}").status_code == 404


def test_history_is_newest_first_and_filterable(user_client):
    c = user_client("aviv")
    squat(c, performed_on="2026-10-01", weight_kg=90)
    squat(c, performed_on="2026-11-01", weight_kg=100)
    deadlift = {"exercise_id": exercise_id(c, "Deadlift"), "weight_kg": 150, "reps": 1}
    c.post("/api/records", json={**deadlift, "performed_on": "2026-11-05"})
    uid = c.get("/api/auth/me").json()["id"]
    all_ = c.get(f"/api/users/{uid}/records").json()
    assert [r["performed_on"] for r in all_] == ["2026-11-05", "2026-11-01", "2026-10-01"]
    only = c.get(f"/api/users/{uid}/records", params={"exercise_id": exercise_id(c, "Back Squat")}).json()
    assert len(only) == 2


def test_users_list(user_client):
    a, _ = user_client("aviv"), user_client("dana")
    squat(a)
    users = {u["username"]: u for u in a.get("/api/users").json()}
    assert users["aviv"]["record_count"] == 1 and users["dana"]["record_count"] == 0


def test_comments_show_author_and_deletion_rules(user_client):
    a, b, c = user_client("aviv"), user_client("dana"), user_client("eli")
    rec = squat(a).json()
    posted = b.post(f"/api/records/{rec['id']}/comments", json={"body": "Beast!"})
    assert posted.status_code == 201 and posted.json()["author_username"] == "dana"
    assert a.get(f"/api/users/{rec['user_id']}/records").json()[0]["comment_count"] == 1

    seen_by_c = c.get(f"/api/records/{rec['id']}/comments").json()[0]
    assert seen_by_c["author_username"] == "dana" and seen_by_c["can_delete"] is False
    assert b.get(f"/api/records/{rec['id']}/comments").json()[0]["can_delete"] is True   # author
    assert a.get(f"/api/records/{rec['id']}/comments").json()[0]["can_delete"] is True   # record owner

    cid = posted.json()["id"]
    assert c.delete(f"/api/comments/{cid}").status_code == 403           # stranger
    assert a.delete(f"/api/comments/{cid}").status_code == 204           # record owner may remove it


def test_comment_author_can_delete_own_and_empty_rejected(user_client):
    a, b = user_client("aviv"), user_client("dana")
    rec = squat(a).json()
    assert b.post(f"/api/records/{rec['id']}/comments", json={"body": "   "}).status_code == 422
    cid = b.post(f"/api/records/{rec['id']}/comments", json={"body": "nice"}).json()["id"]
    assert b.delete(f"/api/comments/{cid}").status_code == 204


def test_comments_vanish_with_their_record(user_client):
    a, b = user_client("aviv"), user_client("dana")
    rec = squat(a).json()
    b.post(f"/api/records/{rec['id']}/comments", json={"body": "nice"})
    assert a.delete(f"/api/records/{rec['id']}").status_code == 204
    assert b.get(f"/api/records/{rec['id']}/comments").status_code == 404


def test_benchmark_wods_come_with_descriptions(user_client):
    c = user_client("aviv")
    by_name = {e["name"]: e for e in c.get("/api/exercises").json()}
    assert "Thrusters" in by_name["Fran"]["description"] and "Pull-ups" in by_name["Fran"]["description"]
    assert by_name["Hyrox Full Race"]["description"]
    assert by_name["Back Squat"]["description"] is None


def test_seed_refreshes_descriptions_of_existing_defaults(user_client, db_session):
    from app.models import Exercise
    from app.seed import seed_default_exercises

    c = user_client("aviv")
    with db_session() as s:
        s.query(Exercise).filter_by(name="Fran").update({"description": "stale text"})
        s.commit()
        seed_default_exercises(s)
    fran = next(e for e in c.get("/api/exercises").json() if e["name"] == "Fran")
    assert "stale" not in fran["description"] and "Thrusters" in fran["description"]


def test_custom_exercise_description(user_client):
    c = user_client("aviv")
    body = {"name": "Farmers 200", "kind": "time", "description": "  200 m with 2x24 kg  "}
    made = c.post("/api/exercises", json=body)
    assert made.status_code == 201 and made.json()["description"] == "200 m with 2x24 kg"
    blank = c.post("/api/exercises", json={"name": "No desc", "kind": "time", "description": "   "})
    assert blank.json()["description"] is None
    too_long = c.post("/api/exercises", json={"name": "Too long", "kind": "time", "description": "x" * 201})
    assert too_long.status_code == 422


def test_custom_exercises(user_client):
    a, b = user_client("aviv"), user_client("dana")
    made = a.post("/api/exercises", json={"name": "Zercher Squat", "kind": "weight_reps"})
    assert made.status_code == 201 and made.json()["is_default"] is False
    assert b.post("/api/exercises", json={"name": "zercher squat", "kind": "weight_reps"}).status_code == 409
    assert a.post("/api/exercises", json={"name": "back squat", "kind": "weight_reps"}).status_code == 409
    eid = made.json()["id"]
    assert b.delete(f"/api/exercises/{eid}").status_code == 403        # not the creator
    assert a.delete(f"/api/exercises/{exercise_id(a, 'Back Squat')}").status_code == 403   # default
    squats = {"exercise_id": eid, "weight_kg": 60, "reps": 5}
    a.post("/api/records", json={**squats, "performed_on": "2026-11-01"})
    assert a.delete(f"/api/exercises/{eid}").status_code == 409        # already used
