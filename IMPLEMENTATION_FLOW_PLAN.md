# PlanLI Production Flow Implementation Plan

## Context (Current State Snapshot)
- Snapshot date: **2026-02-28**.
- Source of truth used: current codebase + live Postgres introspection.
- Existing DB tables: `users`, `conversations`, `messages`, `constraints`, `weeks`, `shifts`, `migrations`.
- Current row counts:
  - `users`: 2 (roles present: `admin`, `doctor`; no `nurse` yet)
  - `conversations`: 1
  - `messages`: 2
  - `constraints`: 1
  - `weeks`: 4
  - `shifts`: 4
  - `migrations`: 10

## What Already Exists (Good Foundation)
- Admin can manage weeks and shifts (`/api/weeks*`, `/api/shifts*`).
- Staff chat endpoint exists (`/api/chat`) and can extract constraints with LLM.
- Constraints are persisted with:
  - `week_start`
  - `start_time`, `end_time` (`timestamptz`)
  - `priority` (`HARD` / `SOFT`)
  - `source_message`
  - `is_full_day`
- User management exists with roles (`admin`, `doctor`, `nurse`) in API validation.

## Gaps vs Required End-to-End Flow
You asked for this lifecycle:
1. Admin defines week (shifts + requirements)
2. System opens constraint collection phase
3. Staff submit constraints via chat
4. After deadline week is locked
5. Admin runs solver
6. Schedule generated
7. Admin reviews and publishes
8. Staff view final schedule

### Missing or Weak Areas
1. **No week lifecycle state machine**
   - No status fields for `DRAFT/COLLECTING/LOCKED/SOLVED/PUBLISHED`.
   - No constraint deadline fields.
2. **No solver integration path**
   - No Python service boundary in backend for CP-SAT execution.
   - No job/run tracking for solver attempts.
3. **No schedule persistence model**
   - No `schedule_versions` / `schedule_assignments` tables.
   - No concept of draft candidate vs published schedule.
4. **No review/publish workflow**
   - No admin endpoint/UI for reviewing solver output and publishing.
5. **No staff schedule view API**
   - No endpoint for "my final schedule for week".
6. **Chat ingestion behavior is incomplete**
   - Messages are only persisted when extracted as valid constraints.
   - `schedule_query` intent has no real schedule retrieval flow.
   - Constraint saves are not gated by week status/deadline.
7. **Production security gap**
   - Auth middleware decodes JWT payload but does not verify signature/issuer/audience (must switch to Firebase Admin token verification).

## Recommended Target Architecture

## 1) Add Week Lifecycle as a State Machine
Extend `weeks` table:
- `status` enum/text: `DRAFT | COLLECTING | LOCKED | SOLVED | PUBLISHED`
- `collection_open_at timestamptz`
- `collection_deadline timestamptz`
- `locked_at timestamptz`
- `published_at timestamptz`
- `published_schedule_version_id uuid null`

Rules:
- `DRAFT -> COLLECTING` only if week has at least one shift.
- `COLLECTING -> LOCKED` automatically at deadline (plus manual lock endpoint).
- `LOCKED -> SOLVING` optional transient state, or keep in run table only.
- `SOLVED -> PUBLISHED` only by explicit admin action.

## 2) Add Schedule Versioning + Assignments
Create tables:
- `schedule_runs`
  - `id uuid`
  - `week_start date`
  - `triggered_by user_id`
  - `status: QUEUED|RUNNING|SUCCEEDED|FAILED`
  - `started_at`, `finished_at`
  - `solver_meta jsonb` (objective, penalty breakdown, infeasibility reason, etc.)
- `schedule_versions`
  - `id uuid`
  - `week_start date`
  - `run_id uuid`
  - `version_number int`
  - `is_published boolean`
  - `created_by user_id`
  - `created_at`
- `schedule_assignments`
  - `id uuid`
  - `schedule_version_id uuid`
  - `shift_id int`
  - `user_id varchar(128)`
  - `source: solver|manual`
  - unique(`schedule_version_id`, `shift_id`, `user_id`)

This gives:
- Multiple solver attempts per week.
- Admin review before publish.
- Immutable history.

## 3) Gate Constraint Collection by Week Status/Deadline
In `ChatService.saveConstraint`:
- Resolve `week_start` from extracted date (already done).
- Validate week exists.
- Validate week is in `COLLECTING`.
- Validate `now <= collection_deadline`.
- Reject otherwise with assistant message: week locked / out of collection phase.

Also add:
- endpoint `GET /api/constraints/week/:weekStart` for admin review.
- endpoint `GET /api/my-constraints?week_start=...` for staff transparency.
- optional endpoint to update/delete own constraints while collecting is open.

## 4) Solver Service Boundary (Python + OR-Tools)
Recommended interface:
- Node endpoint: `POST /api/weeks/:weekStart/solve`
  - Admin only
  - Week must be `LOCKED`
  - Creates `schedule_run` row as `QUEUED`
  - Dispatches async worker call to Python solver service
- Python endpoint: `POST /solve-week`
  - Input payload:
    - users with roles
    - shifts with doctor/nurse requirements
    - constraints split HARD/SOFT
  - Output payload:
    - feasibility status
    - assignments list
    - metrics + violated soft constraints

On success:
- Node creates new `schedule_version` + `schedule_assignments`.
- Week moves to `SOLVED`.

## 5) Admin Review + Publish
Add APIs:
- `GET /api/weeks/:weekStart/schedule-versions`
- `GET /api/schedule-versions/:versionId`
- `POST /api/schedule-versions/:versionId/publish`

Publish behavior:
- Single published version per week.
- Set `weeks.status = PUBLISHED`.
- Persist `published_schedule_version_id`.
- Optional notification job (email/push).

## 6) Staff Final Schedule Consumption
Add APIs:
- `GET /api/my-schedule?week_start=YYYY-MM-DD`
  - returns assignments from published version only.
- `GET /api/admin/schedule?week_start=YYYY-MM-DD`
  - full week published schedule for admin.

Then wire chat `schedule_query` intent to call `my-schedule` backend logic and return natural-language summary.

## 7) Security Hardening (Must-Do Before Production)
1. Replace JWT decode-only auth with **Firebase Admin `verifyIdToken`**.
2. Remove client-supplied `userId` requirement in chat body:
   - derive from `req.authUser.uid` server-side.
3. Ensure all admin endpoints enforce verified DB role from authenticated UID.

## 8) Observability + Reliability
- Add structured logs with `request_id`, `week_start`, `run_id`.
- Add idempotency guard:
  - prevent parallel solve runs on same locked week unless forced.
- Add DB indexes:
  - `constraints(week_start, user_id)`
  - `schedule_runs(week_start, status)`
  - `schedule_assignments(schedule_version_id, shift_id)`
- Add basic metrics:
  - solve success rate
  - solve duration
  - average soft violations

## Implementation Phases (Pragmatic Sequence)

### Phase 1: Lifecycle + Security
- Add week state/deadline columns + migration.
- Add week state transition endpoints (`open-collection`, `lock`).
- Enforce Firebase token verification.
- Enforce constraint write gating by state/deadline.

### Phase 2: Solver Pipeline
- Add schedule run/version/assignment tables + migrations.
- Implement Node -> Python solver client + async run orchestration.
- Persist candidate schedule version on success/failure metadata.

### Phase 3: Review + Publish + Staff Views
- Build admin review endpoints and UI.
- Add publish endpoint and published version semantics.
- Add staff "my schedule" endpoint + UI screen.
- Connect chat `schedule_query` to published schedule data.

### Phase 4: Quality Bar
- Integration tests:
  - state transitions
  - deadline lock behavior
  - solve run creation + assignment persistence
  - publish visibility rules
- Add audit events for critical actions:
  - week opened/locked
  - solver run started/finished
  - schedule published

## Immediate Next Steps (Highest ROI)
1. Add DB migration for week lifecycle (`status`, deadlines, publication fields).
2. Add backend guard in `saveConstraint` to reject writes unless week is `COLLECTING` and before deadline.
3. Implement secure Firebase token verification middleware.
4. Add solver run/version/assignment schema and `POST /api/weeks/:weekStart/solve`.
5. Implement admin publish endpoint + staff `GET /api/my-schedule`.


