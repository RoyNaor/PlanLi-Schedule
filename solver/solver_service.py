from __future__ import annotations

from datetime import datetime, timedelta
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

HARD_WORKER_STATE_PHRASES = {
    "after_shift",
    "approved_leave",
    "approved_vacation",
    "conference",
    "course",
    "holiday",
    "leave",
    "military",
    "post_call",
    "reserve",
    "reserves",
    "sick",
    "sick_leave",
    "training",
    "vacation",
    "אחרי תורנות",
    "בחופש",
    "בקורס",
    "חופש",
    "חופש מאושר",
    "חופשה מאושרת",
    "מחלה",
    "מילואים",
    "קופח",
    "קופת חולים",
    "קורס",
    "כנס",
}

SOFT_WORKER_STATE_PHRASES = {
    "if_possible",
    "leave_request",
    "preference",
    "prefer",
    "request",
    "requested_leave",
    "requested_vacation",
    "soft",
    "vacation_request",
    "אשמח",
    "אם אפשר",
    "בקשה",
    "חליפי",
    "חופש מבוקש",
    "מבקש",
    "מבקשת",
    "מעדיף",
    "מעדיפה",
}

NON_BLOCKING_STATE_PHRASES = {
    "active",
    "available",
    "working",
    "זמין",
    "זמינה",
    "עובד",
    "עובדת",
}

SOFT_PREFERENCE_BASE_WEIGHT = 1000
SENIORITY_WEIGHT_MULTIPLIER = 100

def as_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    return int(value)


def normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_priority(value: Any) -> str | None:
    raw = normalize_text(value)
    if not raw:
        return None
    if raw in {"hard", "קשיח", "חובה", "blocked"}:
        return "HARD"
    if raw in {"soft", "רך", "בקשה", "preference", "request"}:
        return "SOFT"
    upper = raw.upper()
    if upper in {"HARD", "SOFT"}:
        return upper
    return None


def normalize_id_set(raw_values: Any, field_name: str) -> set[str] | None:
    if raw_values is None:
        return None
    if not isinstance(raw_values, list):
        raise ValueError(f"{field_name} must be an array")

    normalized: set[str] = set()
    for raw_value in raw_values:
        if isinstance(raw_value, dict):
            raw_id = (
                raw_value.get("id")
                or raw_value.get("department_id")
                or raw_value.get("arrangement_id")
                or raw_value.get("name")
            )
        else:
            raw_id = raw_value
        if raw_id is not None and str(raw_id):
            normalized.add(str(raw_id))

    return normalized


def state_text(state: dict[str, Any]) -> str:
    parts = [
        state.get("state"),
        state.get("status"),
        state.get("kind"),
        state.get("type"),
        state.get("category"),
        state.get("reason"),
        state.get("note"),
        state.get("text"),
        state.get("label"),
    ]
    return " ".join(normalize_text(part) for part in parts if part is not None)


def worker_state_effect(state: dict[str, Any]) -> str:
    explicit_priority = normalize_priority(state.get("priority") or state.get("constraint_priority"))
    if explicit_priority == "HARD":
        return "hard"
    if explicit_priority == "SOFT":
        return "soft"

    if "blocks_assignment" in state:
        return "hard" if bool(state["blocks_assignment"]) else "ignore"
    if bool(state.get("is_request") or state.get("soft") or state.get("is_soft")):
        return "soft"

    text = state_text(state)
    if not text:
        return "ignore"
    if any(phrase in text for phrase in SOFT_WORKER_STATE_PHRASES):
        return "soft"
    if any(phrase in text for phrase in NON_BLOCKING_STATE_PHRASES):
        return "ignore"
    if any(phrase in text for phrase in HARD_WORKER_STATE_PHRASES):
        return "hard"
    return "ignore"


def preference_weight(record: dict[str, Any], seniority: int) -> int:
    base_weight = as_int(
        record.get("weight")
        or record.get("penalty")
        or record.get("priority_weight"),
        SOFT_PREFERENCE_BASE_WEIGHT,
    )
    return base_weight + seniority * SENIORITY_WEIGHT_MULTIPLIER


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
    return normalize_id_set(raw_departments, "worker department eligibility")


def normalize_worker_arrangements(worker: dict[str, Any]) -> set[str] | None:
    raw_arrangements = (
        worker.get("arrangement_ids")
        or worker.get("eligible_arrangement_ids")
        or worker.get("arrangements")
    )
    return normalize_id_set(raw_arrangements, "worker arrangement eligibility")


def normalize_worker_department_arrangements(worker: dict[str, Any]) -> dict[str, set[str]] | None:
    raw_map = worker.get("department_arrangements") or worker.get("eligible_department_arrangements")
    if raw_map is None:
        return None
    if not isinstance(raw_map, dict):
        raise ValueError("worker department_arrangements must be an object")

    normalized: dict[str, set[str]] = {}
    for department_id, arrangement_ids in raw_map.items():
        normalized_set = normalize_id_set(arrangement_ids, "department arrangement eligibility")
        normalized[str(department_id)] = normalized_set or set()
    return normalized


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
    return worker_state_effect(state) == "hard"


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


def is_date_only(value: Any) -> bool:
    return isinstance(value, str) and len(value.strip()) == 10 and value.count("-") == 2


def parse_timed_record_window(record: dict[str, Any], record_name: str) -> tuple[datetime, datetime]:
    start_raw = record.get("start_time") or record.get("start_at") or record.get("start_date")
    end_raw = record.get("end_time") or record.get("end_at") or record.get("end_date")

    if start_raw is None and end_raw is None and record.get("date") is not None:
        start_dt = parse_iso_datetime(str(record["date"]))
        return start_dt, start_dt + timedelta(days=1)

    if start_raw is None or end_raw is None:
        raise ValueError(f"{record_name} is missing start_time/end_time or date")

    start_dt = parse_iso_datetime(str(start_raw))
    end_dt = parse_iso_datetime(str(end_raw))
    if is_date_only(end_raw):
        end_dt += timedelta(days=1)
    return start_dt, end_dt


def parse_shift_datetime(date_str: str, time_str: str) -> datetime:
    raw = f"{date_str}T{time_str}"
    fmt = "%Y-%m-%dT%H:%M:%S" if len(time_str) == 8 else "%Y-%m-%dT%H:%M"
    dt = datetime.strptime(raw, fmt)
    return dt.replace(tzinfo=JERUSALEM_TZ)


def parse_shift_window(date_str: str, start_time_str: str, end_time_str: str) -> tuple[datetime, datetime]:
    """Parse a shift into (start_dt, end_dt), adding 1 day to end_dt for overnight shifts."""
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
        normalize_worker_arrangements(worker)
        normalize_worker_department_arrangements(worker)

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
        if not worker_id:
            raise ValueError("constraint is missing worker_id/user_id")
        parse_timed_record_window(c, "constraint")
        if normalize_priority(c.get("priority", "SOFT")) not in {"HARD", "SOFT"}:
            raise ValueError("constraint priority must be HARD or SOFT")

    worker_states = collect_worker_states(payload, workers)
    for state in worker_states:
        worker_id = str(state.get("worker_id") or state.get("user_id") or "")
        if not worker_id:
            raise ValueError("worker state is missing worker_id/user_id")
        parse_timed_record_window(state, "worker state")
        explicit_priority = state.get("priority") or state.get("constraint_priority")
        if explicit_priority is not None and normalize_priority(explicit_priority) not in {"HARD", "SOFT"}:
            raise ValueError("worker state priority must be HARD or SOFT")

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
    worker_real_id: dict[str, str] = {}
    workers_by_real_id: dict[str, list[str]] = {}
    worker_type: dict[str, str] = {}
    worker_seniority: dict[str, int] = {}
    worker_departments: dict[str, set[str] | None] = {}
    worker_arrangements: dict[str, set[str] | None] = {}
    worker_department_arrangements: dict[str, dict[str, set[str]] | None] = {}

    for worker in workers:
        worker_id = normalize_worker_id(worker)
        real_id = str(
            worker.get("user_id")
            or worker.get("person_id")
            or worker.get("staff_id")
            or worker_id
        )
        worker_by_id[worker_id] = worker
        worker_real_id[worker_id] = real_id
        workers_by_real_id.setdefault(real_id, []).append(worker_id)
        worker_type[worker_id] = normalize_worker_type(worker)
        worker_seniority[worker_id] = as_int(worker.get("seniority", 0))
        worker_departments[worker_id] = normalize_worker_departments(worker)
        worker_arrangements[worker_id] = normalize_worker_arrangements(worker)
        worker_department_arrangements[worker_id] = normalize_worker_department_arrangements(worker)

    def worker_can_cover_shift(worker_id: str, shift: dict[str, Any]) -> bool:
        department_id = str(shift["department_id"])
        arrangement_id = str(shift.get("arrangement_id") or shift.get("arrangement") or "")
        allowed_departments = worker_departments[worker_id]
        if allowed_departments is not None and department_id not in allowed_departments:
            return False

        allowed_arrangements = worker_arrangements[worker_id]
        if arrangement_id and allowed_arrangements is not None and arrangement_id not in allowed_arrangements:
            return False

        allowed_by_department = worker_department_arrangements[worker_id]
        if arrangement_id and allowed_by_department is not None and department_id in allowed_by_department:
            return arrangement_id in allowed_by_department[department_id]

        return True

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
                            "monthly_solver_version": 3,
                            "department_id": shift.get("department_id"),
                            "arrangement_id": shift.get("arrangement_id"),
                        },
                    }
                )

            model.Add(sum(role_vars) == required_count)

    # One worker cannot be in two departments/arrangements at overlapping times.
    for real_worker_ids in workers_by_real_id.values():
        worker_shift_pairs = [
            (worker_id, shift_id)
            for worker_id in real_worker_ids
            for shift_id in ordered_shift_ids
            if (worker_id, shift_id) in assignment_vars
        ]
        for i in range(len(worker_shift_pairs)):
            w1, s1 = worker_shift_pairs[i]
            s1_start, s1_end = shift_windows[s1]
            for j in range(i + 1, len(worker_shift_pairs)):
                w2, s2 = worker_shift_pairs[j]
                s2_start, s2_end = shift_windows[s2]
                if intervals_overlap(s1_start, s1_end, s2_start, s2_end):
                    model.Add(assignment_vars[(w1, s1)] + assignment_vars[(w2, s2)] <= 1)

    soft_penalty_terms: list[Any] = []
    soft_penalties: list[dict[str, Any]] = []
    hard_state_blocks = 0

    def add_soft_preference(var: cp_model.IntVar, worker_id: str, source: str, record: dict[str, Any]) -> None:
        seniority = worker_seniority[worker_id]
        weight = preference_weight(record, seniority)
        soft_penalty_terms.append(var * weight)
        soft_penalties.append(
            {
                "var": var,
                "weight": weight,
                "seniority": seniority,
                "source": source,
                "worker_id": worker_id,
            }
        )

    # User constraints: HARD blocks, SOFT uses seniority-weighted penalty.
    for c in constraints:
        raw_worker_id = str(c.get("worker_id") or c.get("user_id"))
        constrained_worker_ids = (
            [raw_worker_id]
            if raw_worker_id in worker_by_id
            else workers_by_real_id.get(raw_worker_id, [])
        )
        if not constrained_worker_ids:
            continue

        c_start, c_end = parse_timed_record_window(c, "constraint")
        if c_end <= c_start:
            continue

        priority = normalize_priority(c.get("priority", "SOFT")) or "SOFT"
        for worker_id in constrained_worker_ids:
            for shift_id, (s_start, s_end) in shift_windows.items():
                var = assignment_vars.get((worker_id, shift_id))
                if var is None or not intervals_overlap(c_start, c_end, s_start, s_end):
                    continue

                if priority == "HARD":
                    model.Add(var == 0)
                else:
                    add_soft_preference(var, worker_id, "constraint", c)

    # Worker states from the monthly model / Excel import:
    # hard states block, soft requests become seniority-weighted preferences.
    for state in worker_states:
        raw_worker_id = str(state.get("worker_id") or state.get("user_id"))
        state_worker_ids = (
            [raw_worker_id]
            if raw_worker_id in worker_by_id
            else workers_by_real_id.get(raw_worker_id, [])
        )
        if not state_worker_ids:
            continue

        state_start, state_end = parse_timed_record_window(state, "worker state")
        if state_end <= state_start:
            continue

        effect = worker_state_effect(state)
        if effect == "ignore":
            continue

        for worker_id in state_worker_ids:
            for shift_id, (s_start, s_end) in shift_windows.items():
                var = assignment_vars.get((worker_id, shift_id))
                if var is None or not intervals_overlap(state_start, state_end, s_start, s_end):
                    continue
                if effect == "hard":
                    model.Add(var == 0)
                    hard_state_blocks += 1
                elif effect == "soft":
                    add_soft_preference(var, worker_id, "worker_state", state)

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
                "solver_meta": {"monthly_solver_version": 3},
            }
        )

    assignments = []
    for (worker_id, shift_id), var in assignment_vars.items():
        if solver.Value(var) != 1:
            continue
        shift = shift_by_id[shift_id]
        real_user_id = worker_real_id[worker_id]
        assignments.append(
            {
                "shift_id": shift_id,
                "user_id": real_user_id,
                "worker_id": real_user_id,
                "solver_worker_id": worker_id,
                "worker_type": worker_type[worker_id],
                "department_id": shift.get("department_id"),
                "arrangement_id": shift.get("arrangement_id"),
            }
        )

    soft_violations = sum(int(solver.Value(penalty["var"])) for penalty in soft_penalties)
    weighted_soft_penalty = sum(
        int(solver.Value(penalty["var"])) * int(penalty["weight"]) for penalty in soft_penalties
    )
    seniority_penalty = sum(
        int(solver.Value(penalty["var"])) * int(penalty["seniority"]) for penalty in soft_penalties
    )
    soft_constraint_violations = sum(
        int(solver.Value(penalty["var"]))
        for penalty in soft_penalties
        if penalty["source"] == "constraint"
    )
    soft_state_violations = sum(
        int(solver.Value(penalty["var"]))
        for penalty in soft_penalties
        if penalty["source"] == "worker_state"
    )
    fairness_imbalance = sum(int(solver.Value(term)) for term in fairness_terms)
    solver_status = "optimal" if status == cp_model.OPTIMAL else "feasible"

    return jsonify(
        {
            "status": "feasible",
            "assignments": assignments,
            "solver_meta": {
                "monthly_solver_version": 3,
                "month": payload.get("month"),
                "solver_status": solver_status,
                "objective_value": solver.ObjectiveValue(),
                "soft_violations": soft_violations,
                "soft_constraint_violations": soft_constraint_violations,
                "soft_state_violations": soft_state_violations,
                "weighted_soft_penalty": weighted_soft_penalty,
                "seniority_penalty": seniority_penalty,
                "fairness_imbalance": fairness_imbalance,
                "hard_state_blocks": hard_state_blocks,
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
