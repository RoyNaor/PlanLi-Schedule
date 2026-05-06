# CP-SAT Solver Service

## Run locally

```bash
python -m venv .venv
. .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python solver_service.py
```

Server listens on `http://localhost:8080`.

## Endpoints

- `GET /health`
- `POST /solve` - accepts the legacy weekly payload and the new monthly payload.
- `POST /solve-month` - monthly payload only.

The Node API calls this service through `SOLVER_SERVICE_URL`. You can verify the Node-to-solver link with:

```bash
curl http://localhost:3000/api/health/solver
```

## Run tests

```bash
python -m unittest discover -s solver -p "test_*.py"
```

## Legacy weekly `POST /solve` request shape

```json
{
  "week_start": "2026-03-01",
  "users": [
    { "id": "midwife_1", "role": "midwife" },
    { "id": "obgyn_1", "role": "obgyn" },
    { "id": "anesthesia_1", "role": "anesthesiologist" }
  ],
  "shifts": [
    {
      "id": 1,
      "shift_date": "2026-03-01",
      "start_time": "08:00",
      "end_time": "16:00",
      "min_midwives": 1,
      "min_obgyns": 1,
      "min_anesthesiologists": 1
    }
  ],
  "constraints": [
    {
      "id": "c1",
      "user_id": "u1",
      "start_time": "2026-03-01T08:00:00+02:00",
      "end_time": "2026-03-01T12:00:00+02:00",
      "priority": "SOFT"
    }
  ]
}
```

Supported staff roles:

- `doctor`
- `nurse`
- `midwife`
- `obgyn`
- `anesthesiologist`
- `orderly`
- `pediatrician`
- `shabbat_scribe`
- `secretary`

## Monthly department solver payload

Use this shape for the new hospital scheduling model:

```json
{
  "month": "2026-05",
  "workers": [
    {
      "id": "u1",
      "worker_type": "senior_doctor",
      "seniority": 10,
      "department_ids": ["delivery", "womens_er"],
      "arrangement_ids": ["regular", "night"]
    },
    {
      "id": "u2",
      "worker_type": "resident",
      "seniority": 2,
      "department_ids": ["delivery"],
      "department_arrangements": { "delivery": ["regular"] }
    }
  ],
  "shifts": [
    {
      "id": "delivery_2026-05-03_morning",
      "department_id": "delivery",
      "arrangement_id": "regular",
      "shift_date": "2026-05-03",
      "start_time": "08:00",
      "end_time": "16:00",
      "requirements": [
        { "worker_type": "senior_doctor", "count": 2 },
        { "worker_type": "resident", "count": 3 },
        { "worker_type": "midwife", "count": 13 }
      ]
    }
  ],
  "constraints": [
    {
      "worker_id": "u1",
      "start_time": "2026-05-03T08:00:00+03:00",
      "end_time": "2026-05-03T16:00:00+03:00",
      "priority": "SOFT"
    }
  ],
  "worker_states": [
    {
      "worker_id": "u2",
      "state": "בקורס",
      "start_time": "2026-05-05T00:00:00+03:00",
      "end_time": "2026-05-07T23:59:59+03:00"
    },
    {
      "worker_id": "u1",
      "state": "vacation_request",
      "date": "2026-05-10"
    }
  ]
}
```

Monthly rules:

- Requirements are per shift, per department, per arrangement.
- A worker can work different departments in different shifts if `department_ids` allows it.
- A worker can also be limited by `arrangement_ids`, or by `department_arrangements` for department-specific arrangement eligibility.
- A worker cannot be assigned to overlapping shifts across departments.
- `HARD` constraints block assignment.
- `SOFT` constraints use seniority-weighted penalties. Violating a senior worker costs more than violating a junior worker, so the solver protects senior preferences when possible.
- Blocking worker states such as `בקורס`, `בחופש`, and `מחלה` behave like hard unavailability.
- Request states such as `vacation_request`, `requested_vacation`, `preference`, or Hebrew free-text requests behave like soft preferences.
- Worker states can be expressed with `start_time`/`end_time`, `start_date`/`end_date`, or a single full-day `date`.
- Fairness minimizes monthly shift-count imbalance between workers of the same `worker_type`.

Monthly response assignments include department context:

```json
{
  "status": "feasible",
  "assignments": [
    {
      "shift_id": "delivery_2026-05-03_morning",
      "user_id": "u1",
      "worker_id": "u1",
      "worker_type": "senior_doctor",
      "department_id": "delivery",
      "arrangement_id": "regular"
    }
  ],
  "solver_meta": {
    "monthly_solver_version": 3,
    "month": "2026-05",
    "soft_violations": 0,
    "soft_constraint_violations": 0,
    "soft_state_violations": 0,
    "weighted_soft_penalty": 0,
    "seniority_penalty": 0,
    "fairness_imbalance": 0,
    "hard_state_blocks": 0
  }
}
```

## Response

```json
{
  "status": "feasible",
  "assignments": [{ "shift_id": 1, "user_id": "u2" }],
  "solver_meta": {
    "solver_status": "feasible",
    "objective_value": 0,
    "soft_violations": 0,
    "wall_time_seconds": 0.01
  }
}
```
