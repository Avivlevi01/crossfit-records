from app.pr import est_1rm
from tests.conftest import exercise_id


def log(c, exercise, date, **values):
    r = c.post(
        "/api/records",
        json={"exercise_id": exercise_id(c, exercise), "performed_on": date, **values},
    )
    assert r.status_code == 201, r.text
    return r.json()


def squat(c, date, weight, reps=1):
    return log(c, "Back Squat", date, weight_kg=weight, reps=reps)


def mine(c, exercise="Back Squat"):
    uid = c.get("/api/auth/me").json()["id"]
    return c.get(f"/api/users/{uid}/records", params={"exercise_id": exercise_id(c, exercise)}).json()


# ---------- estimated 1RM ----------


def test_est_1rm_formula():
    assert est_1rm(100, 1) == 100          # a single is already a 1RM
    assert est_1rm(100, 5) == 116.7        # Epley: 100 * (1 + 5/30)
    assert est_1rm(60, 12) == 84.0
    assert est_1rm(60, 13) is None         # too many reps: formula unreliable
    assert est_1rm(None, 5) is None
    assert est_1rm(0, 5) is None


def test_est_1rm_in_api_only_for_weight_exercises(user_client):
    c = user_client("aviv")
    assert squat(c, "2026-11-01", 100, 5)["est_1rm"] == 116.7
    assert log(c, "Pull-ups", "2026-11-01", reps=10)["est_1rm"] is None
    assert log(c, "Fran", "2026-11-01", time_seconds=300)["est_1rm"] is None


# ---------- celebration after saving ----------


def test_first_record_is_a_baseline_not_a_pr(user_client):
    c = user_client("aviv")
    rec = squat(c, "2026-11-01", 100, 5)
    assert rec["celebration"] == {"type": "first", "previous": None}
    assert rec["is_pr"] is False and rec["is_current_pr"] is True


def test_heavier_weight_is_a_new_pr_and_reports_the_previous_one(user_client):
    c = user_client("aviv")
    squat(c, "2026-11-01", 100, 5)
    rec = squat(c, "2026-11-08", 102.5, 3)
    assert rec["celebration"]["type"] == "new"
    assert rec["celebration"]["previous"]["weight_kg"] == 100
    assert rec["celebration"]["previous"]["reps"] == 5
    assert rec["is_pr"] and rec["is_current_pr"]


def test_equal_or_lower_is_not_celebrated(user_client):
    c = user_client("aviv")
    squat(c, "2026-11-01", 100, 5)
    assert squat(c, "2026-11-08", 100, 5)["celebration"] is None   # tie
    assert squat(c, "2026-11-09", 90, 8)["celebration"] is None    # lighter, even with more reps


def test_same_weight_more_reps_is_a_pr(user_client):
    c = user_client("aviv")
    squat(c, "2026-11-01", 100, 3)
    assert squat(c, "2026-11-08", 100, 5)["celebration"]["type"] == "new"


def test_time_exercises_lower_is_better(user_client):
    c = user_client("aviv")
    log(c, "Fran", "2026-11-01", time_seconds=300)
    slower = log(c, "Fran", "2026-11-08", time_seconds=320)
    faster = log(c, "Fran", "2026-11-15", time_seconds=275.5)
    assert slower["celebration"] is None
    assert faster["celebration"]["type"] == "new" and faster["celebration"]["previous"]["time_seconds"] == 300


def test_reps_only_and_distance_rules(user_client):
    c = user_client("aviv")
    log(c, "Pull-ups", "2026-11-01", reps=10)
    assert log(c, "Pull-ups", "2026-11-08", reps=12)["celebration"]["type"] == "new"
    assert log(c, "Pull-ups", "2026-11-09", reps=11)["celebration"] is None
    log(c, "Run (any distance)", "2026-11-01", distance_m=5000, time_seconds=1500)
    longer = log(c, "Run (any distance)", "2026-11-08", distance_m=6000, time_seconds=2000)
    assert longer["celebration"]["type"] == "new"                  # farther wins even though slower
    same_but_faster = log(c, "Run (any distance)", "2026-11-15", distance_m=6000, time_seconds=1900)
    assert same_but_faster["celebration"]["type"] == "new"         # same distance, faster time


def test_other_peoples_records_do_not_affect_my_pr(user_client):
    a, b = user_client("aviv"), user_client("dana")
    squat(b, "2026-11-01", 200)
    rec = squat(a, "2026-11-01", 60)
    assert rec["celebration"]["type"] == "first"                   # not compared with dana


def test_editing_a_record_into_a_pr_celebrates(user_client):
    c = user_client("aviv")
    squat(c, "2026-11-01", 100)
    light = squat(c, "2026-11-08", 80)
    r = c.put(
        f"/api/records/{light['id']}",
        json={"exercise_id": light["exercise"]["id"], "weight_kg": 105, "reps": 1, "performed_on": "2026-11-08"},
    )
    assert r.json()["celebration"]["type"] == "new"


# ---------- flags in the history list ----------


def test_flags_across_the_history(user_client):
    c = user_client("aviv")
    squat(c, "2026-10-01", 100)    # baseline
    squat(c, "2026-10-08", 90)     # worse
    squat(c, "2026-10-15", 105)    # PR
    squat(c, "2026-10-22", 105)    # tie: the earlier one keeps the PR
    by_date = {r["performed_on"]: r for r in mine(c)}
    assert [by_date[d]["is_pr"] for d in sorted(by_date)] == [False, False, True, False]
    assert [by_date[d]["is_current_pr"] for d in sorted(by_date)] == [False, False, True, False]
    assert all(r["celebration"] is None for r in by_date.values())  # celebration only right after saving


def test_flags_follow_the_date_not_the_order_of_entry(user_client):
    c = user_client("aviv")
    squat(c, "2026-11-15", 100)
    squat(c, "2026-11-01", 95)     # entered later but happened earlier
    by_date = {r["performed_on"]: r for r in mine(c)}
    assert by_date["2026-11-15"]["is_pr"] is True and by_date["2026-11-15"]["is_current_pr"] is True
    assert by_date["2026-11-01"]["is_pr"] is False


def test_friends_see_the_same_flags(user_client):
    a, b = user_client("aviv"), user_client("dana")
    squat(a, "2026-11-01", 100)
    squat(a, "2026-11-08", 110)
    uid = a.get("/api/auth/me").json()["id"]
    seen = b.get(f"/api/users/{uid}/records").json()
    assert sorted(r["weight_kg"] for r in seen if r["is_current_pr"]) == [110]
