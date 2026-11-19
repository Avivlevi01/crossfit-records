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


def board(c, exercise="Back Squat"):
    r = c.get(f"/api/leaderboard/{exercise_id(c, exercise)}")
    assert r.status_code == 200, r.text
    return r.json()["entries"]


def names_and_ranks(entries):
    return [(e["username"], e["rank"]) for e in entries]


def test_needs_login(make_client):
    c = make_client()
    assert c.get("/api/leaderboard").status_code == 401
    assert c.get("/api/leaderboard/1").status_code == 401


def test_heaviest_first_and_everyone_sees_the_same_board(user_client):
    a, b, c = user_client("aviv"), user_client("dana"), user_client("eli")
    squat(a, "2026-11-01", 100)
    squat(b, "2026-11-02", 120)
    squat(c, "2026-11-03", 110)
    expected = [("dana", 1), ("eli", 2), ("aviv", 3)]
    assert names_and_ranks(board(a)) == expected
    assert names_and_ranks(board(c)) == expected


def test_each_person_is_ranked_by_their_pr_not_their_latest_record(user_client):
    a, b = user_client("aviv"), user_client("dana")
    squat(a, "2026-11-01", 130)
    squat(a, "2026-11-10", 80)        # a bad day must not drop him down
    squat(b, "2026-11-05", 120)
    entries = board(a)
    assert names_and_ranks(entries) == [("aviv", 1), ("dana", 2)]
    assert entries[0]["weight_kg"] == 130 and entries[0]["performed_on"] == "2026-11-01"


def test_same_weight_more_reps_ranks_higher(user_client):
    a, b = user_client("aviv"), user_client("dana")
    squat(a, "2026-11-01", 100, reps=3)
    squat(b, "2026-11-02", 100, reps=5)
    assert names_and_ranks(board(a)) == [("dana", 1), ("aviv", 2)]


def test_ties_share_a_rank_and_the_earlier_one_is_listed_first(user_client):
    a, b, c = user_client("aviv"), user_client("dana"), user_client("eli")
    squat(a, "2026-11-05", 100)
    squat(b, "2026-11-02", 100)       # same PR, reached earlier
    squat(c, "2026-11-03", 90)
    assert names_and_ranks(board(a)) == [("dana", 1), ("aviv", 1), ("eli", 3)]


def test_time_exercises_fastest_first(user_client):
    a, b = user_client("aviv"), user_client("dana")
    log(a, "Fran", "2026-11-01", time_seconds=300)
    log(b, "Fran", "2026-11-01", time_seconds=250.5)
    entries = board(a, "Fran")
    assert names_and_ranks(entries) == [("dana", 1), ("aviv", 2)]
    assert entries[0]["time_seconds"] == 250.5 and entries[0]["est_1rm"] is None


def test_reps_only_and_distance_boards(user_client):
    a, b = user_client("aviv"), user_client("dana")
    log(a, "Pull-ups", "2026-11-01", reps=15)
    log(b, "Pull-ups", "2026-11-01", reps=20)
    assert names_and_ranks(board(a, "Pull-ups")) == [("dana", 1), ("aviv", 2)]
    log(a, "Run (any distance)", "2026-11-01", distance_m=5000, time_seconds=1500)
    log(b, "Run (any distance)", "2026-11-01", distance_m=8000, time_seconds=3000)
    assert names_and_ranks(board(a, "Run (any distance)")) == [("dana", 1), ("aviv", 2)]


def test_only_people_with_records_appear_and_estimated_1rm_is_included(user_client):
    a, _ = user_client("aviv"), user_client("dana")   # dana never logs a squat
    squat(a, "2026-11-01", 100, reps=5)
    entries = board(a)
    assert names_and_ranks(entries) == [("aviv", 1)]
    assert entries[0]["est_1rm"] == 116.7


def test_empty_board_and_unknown_exercise(user_client):
    a = user_client("aviv")
    assert board(a) == []
    assert a.get("/api/leaderboard/99999").status_code == 404


def test_overview_lists_only_logged_exercises_most_popular_first(user_client):
    a, b = user_client("aviv"), user_client("dana")
    assert a.get("/api/leaderboard").json() == []
    squat(a, "2026-11-01", 100)
    log(a, "Fran", "2026-11-01", time_seconds=300)
    log(b, "Fran", "2026-11-01", time_seconds=280)
    squat(a, "2026-11-08", 105)        # a second record by the same person is still one participant
    overview = a.get("/api/leaderboard").json()
    assert [(o["exercise"]["name"], o["participants"]) for o in overview] == [("Fran", 2), ("Back Squat", 1)]
