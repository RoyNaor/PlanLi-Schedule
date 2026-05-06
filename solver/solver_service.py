from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, request
from ortools.sat.python import cp_model

app = Flask(__name__)
JERUSALEM_TZ = ZoneInfo("Asia/Jerusalem")

STAFFING_FIELDS: dict[str, str] = {
    "doctor": "min_doctors",
    "nurse": "min_nurses",
    "midwife": "min_midwives",
    "obgyn": "min_obgyns",
    "anesthesiologist": "min_anesthesiologists",
    "orderly": "min_orderlies",
    "pediatrician": "min_pediatricians",
    "shabbat_scribe": "min_shabbat_scribes",
    "secretary": "min_secretaries",
}

STAFF_ROLES = set(STAFFING_FIELDS.keys())

BLOCKING_WORKER_STATES = {
    "course",
    "training",
    "vacation",
    "holiday",
    "leave",
    "sick",
    "sick_leave",
    "בקורס",
    "בחופש",
    "מחלה",
}

NON_BLOCKING_WORKER_STATES = {
    "working",
    "active",
    "available",
    "עובד",
    "עובדת",
}


def as_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    return int(value)


def is_monthly_payload(payload: dict[str, Any]) -> bool:
    shifts = payload.get("shifts", [])
    return (
        "month" in payload
        or "workers" in payload
        or "departments" in payload
        or "arrangements" in payload
        or any(isinstance(shift, dict) and ("department_id" in shift or "requirements" in shift) for shift in shifts)
    )


def normalize_worker_id(worker: dict[str, Any]) -> str:
    return str(worker.get("id") or worker.get("worker_id") or worker.get("user_id") or "")


def normalize_worker_type(worker: dict[str, Any]) -> str:
    return str(worker.get("worker_type") or worker.get("type") or worker.get("role") or "")


def normalize_worker_departments(worker: dict[str, Any]) -> set[str] | None:
    raw_departments = (
        worker.get("department_ids")
        or worker.get("eligible_department_ids")
        or worker.get("departments")
    )
    if raw_departments is None:
        return None
    if not isinstance(raw_departments, list):
        raise ValueError("worker department eligibility must be an array")
    return {str(department_id) for department_id in raw_departments}


def normalize_shift_requirements(shift: dict[str, Any]) -> dict[str, int]:
    requirements: dict[str, int] = {}

    raw_requirements = shift.get("requirements", shift.get("required_staff", []))
    if isinstance(raw_requirements, dict):
        for worker_type, count in raw_requirements.items():
            normalized_type = str(worker_type)
            requirements[normalized_type] = requirements.get(normalized_type, 0) + as_int(count)
    elif isinstance(raw_requirements, list):
        for requirement in raw_requirements:
            if not isinstance(requirement, dict):
                raise ValueError("each shift requirement must be an object")
            worker_type = str(
                requirement.get("worker_type")
                or requirement.get("type")
                or requirement.get("role")
                or ""
            )
            if not worker_type:
                raise ValueError("shift requirement is missing worker_type")
            requirements[worker_type] = requirements.get(worker_type, 0) + as_int(requirement.get("count", 0))
    else:
        raise ValueError("shift requirements must be an array or object")

    for worker_type, field in STAFFING_FIELDS.items():
        count = as_int(shift.get(field, 0))
        if count > 0:
            requirements[worker_type] = requirements.get(worker_type, 0) + count

    for worker_type, count in requirements.items():
        if count < 0:
            raise ValueError(f"requirement for {worker_type} must be non-negative")

    return {worker_type: count for worker_type, count in requirements.items() if count > 0}


def state_blocks_assignment(state: dict[str, Any]) -> bool:
    if "blocks_assignment" in state:
        return bool(state["blocks_assignment"])

    state_name = str(state.get("state") or state.get("status") or "").strip().lower()
    if state_name in NON_BLOCKING_WORKER_STATES:
        return False
    return state_name in BLOCKING_WORKER_STATES


def collect_worker_states(payload: dict[str, Any], workers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    states: list[dict[str, Any]] = []
    raw_states = payload.get("worker_states", payload.get("states", []))
    if raw_states is None:
        raw_states = []
    if not isinstance(raw_states, list):
        raise ValueError("worker_states must be an array")

    for state in raw_states:
        if not isinstance(state, dict):
            raise ValueError("each worker state must be an object")
        states.append(state)

    for worker in workers:
        worker_id = normalize_worker_id(worker)
        raw_worker_states = worker.get("states", [])
        if raw_worker_states is None:
            continue
        if not isinstance(raw_worker_states, list):
            raise ValueError("worker states must be an array")
        for state in raw_worker_states:
            if not isinstance(state, dict):
                raise ValueError("each worker state must be an object")
            states.append({**state, "worker_id": worker_id})

    return states


def parse_iso_datetime(value: str) -> datetime:
    # Accept "Z" suffix and timezone offsets.
    normalized = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        # Constraint payload should be tz-aware; treat naive as Jerusalem local.
        return dt.replace(tzinfo=JERUSALEM_TZ)
    return dt


def parse_shift_datetime(date_str: str, time_str: str) -> datetime:
    raw = f"{date_str}T{time_str}"
    fmt = "%Y-%m-%dT%H:%M:%S" if len(time_str) == 8 else "%Y-%m-%dT%H:%M"
    dt = datetime.strptime(raw, fmt)
    return dt.replace(tzinfo=JERUSALEM_TZ)


def parse_shift_window(date_str: str, start_time_str: str, end_time_str: str) -> tuple[datetime, datetime]:
    """Parse a shift into (start_dt, end_dt), adding 1 day to end_dt for overnight shifts."""
    from datetime import timedelta
    start_dt = parse_shift_datetime(date_str, start_time_str)
    end_dt = parse_shift_datetime(date_str, end_time_str)
    # Overnight shift: end time is on the next calendar day.
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return start_dt, end_dt


def intervals_overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


def validate_payload(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    users = payload.get("users")
    shifts = payload.get("shifts")
    constraints = payload.get("constraints", [])

    if not isinstance(users, list) or not isinstance(shifts, list) or not isinstance(constraints, list):
        raise ValueError("users, shifts, and constraints must be arrays")

    for user in users:
        if not isinstance(user, dict):
            raise ValueError("each user must be an object")
        if not user.get("id") or user.get("role") not in STAFF_ROLES:
            raise ValueError("user must include id and a supported staff role")

    for shift in shifts:
        if not isinstance(shift, dict):
            raise ValueError("each shift must be an object")
        required = ["id", "shift_date", "start_time", "end_time"]
        if any(key not in shift for key in required):
            raise ValueError("shift is missing required fields")
        for field in STAFFING_FIELDS.values():
            if int(shift.get(field, 0)) < 0:
                raise ValueError("shift staffing counts must be non-negative")

    for c in constraints:
        if not isinstance(c, dict):
            raise ValueError("each constraint must be an object")
        required = ["user_id", "start_time", "end_time", "priority"]
        if any(key not in c for key in required):
            raise ValueError("constraint is missing required fields")
        if c["priority"] not in {"HARD", "SOFT"}:
            raise ValueError("constraint priority must be HARD or SOFT")

    return users, shifts, constraints


def validate_monthly_payload(
    payload: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    workers = payload.get("workers", payload.get("users"))
    shifts = payload.get("shifts")
    constraints = payload.get("constraints", [])

    if not isinstance(workers, list) or not isinstance(shifts, list) or not isinstance(constraints, list):
        raise ValueError("workers/users, shifts, and constraints must be arrays")

    worker_ids: set[str] = set()
    for worker in workers:
        if not isinstance(worker, dict):
            raise ValueError("each worker must be an object")
        worker_id = normalize_worker_id(worker)
        worker_type = normalize_worker_type(worker)
        if not worker_id or not worker_type:
            raise ValueError("worker must include id and worker_type/type/role")
        if worker_id in worker_ids:
            raise ValueError(f"duplicate worker id {worker_id}")
        worker_ids.add(worker_id)
        if as_int(worker.get("seniority", 0)) < 0:
            raise ValueError("worker seniority must be non-negative")
        normalize_worker_departments(worker)

    for shift in shifts:
        if not isinstance(shift, dict):
            raise ValueError("each shift must be an object")
        required = ["id", "department_id", "shift_date", "start_time", "end_time"]
        if any(key not in shift for key in required):
            raise ValueError("monthly shift is missing id, department_id, shift_date, start_time, or end_time")
        normalize_shift_requirements(shift)

    for c in constraints:
        if not isinstance(c, dict):
            raise ValueError("each constraint must be an object")
        worker_id = str(c.get("worker_id") or c.get("user_id") or "")
        if not worker_id or "start_time" not in c or "end_time" not in c:
            raise ValueError("constraint is missing worker_id/user_id, start_time, or end_time")
        if c.get("priority", "SOFT") not in {"HARD", "SOFT"}:
            raise ValueError("constraint priority must be HARD or SOFT")

    worker_states = collect_worker_states(payload, workers)
    for state in worker_states:
        worker_id = str(state.get("worker_id") or state.get("user_id") or "")
        if not worker_id or "start_time" not in state or "end_time" not in state:
            raise ValueError("worker state is missing worker_id/user_id, start_time, or end_time")

    return workers, shifts, constraints, worker_states


def solve_monthly_payload(payload: dict[str, Any]) -> Any:
    workers, shifts, constraints, worker_states = validate_monthly_payload(payload)

    shift_windows: dict[Any, tuple[datetime, datetime]] = {}
    shift_by_id: dict[Any, dict[str, Any]] = {}
    shift_requirements: dict[Any, dict[str, int]] = {}
    ordered_shift_ids: list[Any] = []

    for shift in shifts:
        shift_id = shift["id"]
        if shift_id in shift_by_id:
            return jsonify(
                {
                    "status": "infeasible",
                    "assignments": [],
                    "message": f"duplicate shift id {shift_id}",
                    "solver_meta": {},
                }
            )
        start_dt, end_dt = parse_shift_window(
            str(shift["shift_date"]), str(shift["start_time"]), str(shift["end_time"])
        )
        shift_windows[shift_id] = (start_dt, end_dt)
        shift_by_id[shift_id] = shift
        shift_requirements[shift_id] = normalize_shift_requirements(shift)
        ordered_shift_ids.append(shift_id)

    worker_by_id: dict[str, dict[str, Any]] = {}
    worker_type: dict[str, str] = {}
    worker_seniority: dict[str, int] = {}
    worker_departments: dict[str, set[str] | None] = {}

    for worker in workers:
        worker_id = normalize_worker_id(worker)
        worker_by_id[worker_id] = worker
        worker_type[worker_id] = normalize_worker_type(worker)
        worker_seniority[worker_id] = as_int(worker.get("seniority", 0))
        worker_departments[worker_id] = normalize_worker_departments(worker)

    def worker_can_cover_shift(worker_id: str, shift: dict[str, Any]) -> bool:
        allowed_departments = worker_departments[worker_id]
        return allowed_departments is None or str(shift["department_id"]) in allowed_departments

    model = cp_model.CpModel()
    assignment_vars: dict[tuple[str, Any], cp_model.IntVar] = {}

    for shift_id in ordered_shift_ids:
        shift = shift_by_id[shift_id]
        required_types = set(shift_requirements[shift_id].keys())
        for worker_id, current_worker_type in worker_type.items():
            if current_worker_type not in required_types:
                continue
            if not worker_can_cover_shift(worker_id, shift):
                continue
            assignment_vars[(worker_id, shift_id)] = model.NewBoolVar(
                f"x_{len(assignment_vars)}"
            )

    # Coverage: each department/arrangement shift has its own required count per worker type.
    for shift_id in ordered_shift_ids:
        shift = shift_by_id[shift_id]
        for required_worker_type, required_count in shift_requirements[shift_id].items():
            role_vars = [
                assignment_vars[(worker_id, shift_id)]
                for worker_id, current_worker_type in worker_type.items()
                if current_worker_type == required_worker_type
                and (worker_id, shift_id) in assignment_vars
            ]

            if required_count > len(role_vars):
                return jsonify(
                    {
                        "status": "infeasible",
                        "assignments": [],
                        "message": (
                            f"not enough {required_worker_type} staff for shift {shift_id} "
                            f"in department {shift.get('department_id')}"
                        ),
                        "solver_meta": {
                            "monthly_solver_version": 2,
                            "department_id": shift.get("department_id"),
                            "arrangement_id": shift.get("arrangement_id"),
                        },
                    }
                )

            model.Add(sum(role_vars) == required_count)

    # One worker cannot be in two departments/arrangements at overlapping times.
    for worker_id in worker_by_id.keys():
        worker_shift_ids = [shift_id for shift_id in ordered_shift_ids if (worker_id, shift_id) in assignment_vars]
        for i in range(len(worker_shift_ids)):
            s1 = worker_shift_ids[i]
            s1_start, s1_end = shift_windows[s1]
            for j in range(i + 1, len(worker_shift_ids)):
                s2 = worker_shift_ids[j]
                s2_start, s2_end = shift_windows[s2]
                if intervals_overlap(s1_start, s1_end, s2_start, s2_end):
                    model.Add(assignment_vars[(worker_id, s1)] + assignment_vars[(worker_id, s2)] <= 1)

    soft_penalty_terms: list[Any] = []
    soft_penalties: list[tuple[cp_model.IntVar, int, int]] = []

    # User constraints: HARD blocks, SOFT uses seniority-weighted penalty.
    for c in constraints:
        worker_id = str(c.get("worker_id") or c.get("user_id"))
        if worker_id not in worker_by_id:
            continue

        c_start = parse_iso_datetime(str(c["start_time"]))
        c_end = parse_iso_datetime(str(c["end_time"]))
        if c_end <= c_start:
            continue

        priority = str(c.get("priority", "SOFT"))
        for shift_id, (s_start, s_end) in shift_windows.items():
            var = assignment_vars.get((worker_id, shift_id))
            if var is None or not intervals_overlap(c_start, c_end, s_start, s_end):
                continue

            if priority == "HARD":
                model.Add(var == 0)
            else:
                seniority = worker_seniority[worker_id]
                weight = 1000 + seniority * 100
                soft_penalty_terms.append(var * weight)
                soft_penalties.append((var, weight, seniority))

    # Worker states: course/vacation/sick can block assignment across date ranges.
    for state in worker_states:
        if not state_blocks_assignment(state):
            continue

        worker_id = str(state.get("worker_id") or state.get("user_id"))
        if worker_id not in worker_by_id:
            continue

        state_start = parse_iso_datetime(str(state["start_time"]))
        state_end = parse_iso_datetime(str(state["end_time"]))
        if state_end <= state_start:
            continue

        for shift_id, (s_start, s_end) in shift_windows.items():
            var = assignment_vars.get((worker_id, shift_id))
            if var is not None and intervals_overlap(state_start, state_end, s_start, s_end):
                model.Add(var == 0)

    # Monthly fairness: equalize total shift count between workers of the same worker_type.
    fairness_terms: list[cp_model.IntVar] = []
    max_possible = len(shifts)
    required_worker_types = {
        worker_type_name
        for requirements in shift_requirements.values()
        for worker_type_name in requirements.keys()
    }

    for current_worker_type in required_worker_types:
        type_worker_ids = [
            worker_id
            for worker_id, worker_type_name in worker_type.items()
            if worker_type_name == current_worker_type
            and any((worker_id, shift_id) in assignment_vars for shift_id in ordered_shift_ids)
        ]
        if len(type_worker_ids) <= 1:
            continue

        loads = []
        for worker_id in type_worker_ids:
            load = model.NewIntVar(0, max_possible, f"load_{len(loads)}_{current_worker_type}")
            model.Add(
                load == sum(
                    assignment_vars[(worker_id, shift_id)]
                    for shift_id in ordered_shift_ids
                    if (worker_id, shift_id) in assignment_vars
                )
            )
            loads.append(load)

        max_load = model.NewIntVar(0, max_possible, f"max_load_{current_worker_type}")
        min_load = model.NewIntVar(0, max_possible, f"min_load_{current_worker_type}")
        model.AddMaxEquality(max_load, loads)
        model.AddMinEquality(min_load, loads)

        imbalance = model.NewIntVar(0, max_possible, f"imbalance_{current_worker_type}")
        model.Add(imbalance == max_load - min_load)
        fairness_terms.append(imbalance)

    objective_terms: list[Any] = []
    objective_terms.extend(soft_penalty_terms)
    objective_terms.extend(term * 50 for term in fairness_terms)
    model.Minimize(sum(objective_terms) if objective_terms else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(payload.get("max_time_seconds", 20.0))
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return jsonify(
            {
                "status": "infeasible",
                "assignments": [],
                "message": "no feasible monthly assignment found",
                "solver_meta": {"monthly_solver_version": 2},
            }
        )

    assignments = []
    for (worker_id, shift_id), var in assignment_vars.items():
        if solver.Value(var) != 1:
            continue
        shift = shift_by_id[shift_id]
        assignments.append(
            {
                "shift_id": shift_id,
                "user_id": worker_id,
                "worker_id": worker_id,
                "worker_type": worker_type[worker_id],
                "department_id": shift.get("department_id"),
                "arrangement_id": shift.get("arrangement_id"),
            }
        )

    soft_violations = sum(int(solver.Value(var)) for var, _weight, _seniority in soft_penalties)
    weighted_soft_penalty = sum(
        int(solver.Value(var)) * weight for var, weight, _seniority in soft_penalties
    )
    seniority_penalty = sum(
        int(solver.Value(var)) * seniority for var, _weight, seniority in soft_penalties
    )
    fairness_imbalance = sum(int(solver.Value(term)) for term in fairness_terms)
    solver_status = "optimal" if status == cp_model.OPTIMAL else "feasible"

    return jsonify(
        {
            "status": "feasible",
            "assignments": assignments,
            "solver_meta": {
                "monthly_solver_version": 2,
                "month": payload.get("month"),
                "solver_status": solver_status,
                "objective_value": solver.ObjectiveValue(),
                "soft_violations": soft_violations,
                "weighted_soft_penalty": weighted_soft_penalty,
                "seniority_penalty": seniority_penalty,
                "fairness_imbalance": fairness_imbalance,
                "wall_time_seconds": solver.WallTime(),
            },
        }
    )


@app.get("/health")
def health() -> Any:
    return jsonify({"ok": True, "service": "cp-sat-solver"})


@app.post("/solve")
def solve() -> Any:
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "request body must be a JSON object"}), 400

        if is_monthly_payload(payload):
            return solve_monthly_payload(payload)

        users, shifts, constraints = validate_payload(payload)

        # Precompute parsed shift windows (overnight shifts supported).
        shift_windows: dict[int, tuple[datetime, datetime]] = {}
        for shift in shifts:
            shift_id = int(shift["id"])
            start_dt, end_dt = parse_shift_window(
                str(shift["shift_date"]), str(shift["start_time"]), str(shift["end_time"])
            )
            shift_windows[shift_id] = (start_dt, end_dt)

        user_role = {str(u["id"]): str(u["role"]) for u in users}
        shift_by_id = {int(s["id"]): s for s in shifts}

        model = cp_model.CpModel()
        assignment_vars: dict[tuple[str, int], cp_model.IntVar] = {}

        for user in users:
            user_id = str(user["id"])
            for shift in shifts:
                shift_id = int(shift["id"])
                assignment_vars[(user_id, shift_id)] = model.NewBoolVar(f"x_{user_id}_{shift_id}")

        # Coverage constraints per shift/role.
        for shift in shifts:
            shift_id = int(shift["id"])
            for role, field in STAFFING_FIELDS.items():
                role_vars = [
                    assignment_vars[(user_id, shift_id)]
                    for user_id, user_role_value in user_role.items()
                    if user_role_value == role
                ]
                minimum_required = int(shift.get(field, 0))

                if minimum_required > len(role_vars):
                    return jsonify(
                        {
                            "status": "infeasible",
                            "assignments": [],
                            "message": f"not enough {role} staff to satisfy coverage",
                            "solver_meta": {},
                        }
                    )

                model.Add(sum(role_vars) == minimum_required)

        # One staff member cannot be assigned to overlapping shifts.
        ordered_shift_ids = sorted(shift_by_id.keys())
        for user_id in user_role.keys():
            for i in range(len(ordered_shift_ids)):
                s1 = ordered_shift_ids[i]
                s1_start, s1_end = shift_windows[s1]
                for j in range(i + 1, len(ordered_shift_ids)):
                    s2 = ordered_shift_ids[j]
                    s2_start, s2_end = shift_windows[s2]
                    if intervals_overlap(s1_start, s1_end, s2_start, s2_end):
                        model.Add(assignment_vars[(user_id, s1)] + assignment_vars[(user_id, s2)] <= 1)

        soft_penalties: list[cp_model.IntVar] = []

        # Apply hard/soft availability constraints.
        for idx, c in enumerate(constraints):
            user_id = str(c["user_id"])
            if user_id not in user_role:
                # Unknown user in payload; ignore so solver can still proceed.
                continue

            c_start = parse_iso_datetime(str(c["start_time"]))
            c_end = parse_iso_datetime(str(c["end_time"]))
            if c_end <= c_start:
                continue

            priority = str(c["priority"])
            for shift_id, (s_start, s_end) in shift_windows.items():
                if not intervals_overlap(c_start, c_end, s_start, s_end):
                    continue

                var = assignment_vars[(user_id, shift_id)]
                if priority == "HARD":
                    model.Add(var == 0)
                else:
                    penalty = model.NewBoolVar(f"soft_penalty_{idx}_{user_id}_{shift_id}")
                    model.Add(penalty == var)
                    soft_penalties.append(penalty)

        # Light fairness by minimizing range of assignments in each role.
        fairness_terms: list[cp_model.IntVar] = []
        max_possible = len(shifts)
        for role in STAFFING_FIELDS.keys():
            role_users = [uid for uid, r in user_role.items() if r == role]
            if len(role_users) <= 1:
                continue

            loads = []
            for uid in role_users:
                load = model.NewIntVar(0, max_possible, f"load_{role}_{uid}")
                model.Add(load == sum(assignment_vars[(uid, sid)] for sid in ordered_shift_ids))
                loads.append(load)

            max_load = model.NewIntVar(0, max_possible, f"max_load_{role}")
            min_load = model.NewIntVar(0, max_possible, f"min_load_{role}")
            model.AddMaxEquality(max_load, loads)
            model.AddMinEquality(min_load, loads)

            imbalance = model.NewIntVar(0, max_possible, f"imbalance_{role}")
            model.Add(imbalance == max_load - min_load)
            fairness_terms.append(imbalance)

        # Objective: prioritize honoring soft constraints, then fairness,
        # then minimize total assignments (avoid over-staffing).
        SOFT_PENALTY_WEIGHT = 100
        FAIRNESS_WEIGHT = 10
        OVERSTAFFING_WEIGHT = 1

        objective_terms: list[Any] = []
        objective_terms.extend(p * SOFT_PENALTY_WEIGHT for p in soft_penalties)
        objective_terms.extend(term * FAIRNESS_WEIGHT for term in fairness_terms)
        # Penalize each assignment lightly so the solver prefers minimum coverage.
        for var in assignment_vars.values():
            objective_terms.append(var * OVERSTAFFING_WEIGHT)
        model.Minimize(sum(objective_terms) if objective_terms else 0)

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 20.0
        solver.parameters.num_search_workers = 8

        status = solver.Solve(model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return jsonify(
                {
                    "status": "infeasible",
                    "assignments": [],
                    "message": "no feasible assignment found",
                    "solver_meta": {},
                }
            )

        assignments = []
        for (user_id, shift_id), var in assignment_vars.items():
            if solver.Value(var) == 1:
                assignments.append({"shift_id": shift_id, "user_id": user_id})

        soft_violations = sum(int(solver.Value(p)) for p in soft_penalties) if soft_penalties else 0
        solver_status = "optimal" if status == cp_model.OPTIMAL else "feasible"

        return jsonify(
            {
                "status": "feasible",
                "assignments": assignments,
                "solver_meta": {
                    "solver_status": solver_status,
                    "objective_value": solver.ObjectiveValue(),
                    "soft_violations": soft_violations,
                    "wall_time_seconds": solver.WallTime(),
                },
            }
        )

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"solver service failed: {exc}"}), 500


@app.post("/solve-month")
def solve_month() -> Any:
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "request body must be a JSON object"}), 400
        return solve_monthly_payload(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"solver service failed: {exc}"}), 500


if __name__ == "__main__":
    import os
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
