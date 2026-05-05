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
- `POST /solve`

The Node API calls this service through `SOLVER_SERVICE_URL`. You can verify the Node-to-solver link with:

```bash
curl http://localhost:3000/api/health/solver
```

## Run tests

```bash
python -m unittest discover -s solver -p "test_*.py"
```

## `POST /solve` request shape

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
