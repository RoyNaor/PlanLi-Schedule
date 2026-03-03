# PlanLI Dev Implementation Reference (Phases 1-3)

This file documents what was added for the scheduling flow and how to run/test it in development.

## 1) What was implemented

The flow now supports:

1. Admin creates week + shifts.
2. Admin opens constraint collection with deadline.
3. Staff submit constraints in chat during collection window only.
4. Week auto-locks after deadline (or manual lock by admin).
5. Solver can run (direct solve or queued run).
6. Solver produces schedule versions and assignments.
7. Admin reviews versions and publishes one version.
8. Staff can view only their published schedule.

## 2) Database changes (new tables/columns)

## 2.1 `weeks` new columns

Added by migrations `0011` and `0013`.

| Column | Type | Meaning |
|---|---|---|
| `status` | `varchar(20)` | Week lifecycle state: `DRAFT`, `COLLECTING`, `LOCKED`, `SOLVED`, `PUBLISHED`. |
| `collection_open_at` | `timestamptz` | Time when admin opened collection. |
| `collection_deadline` | `timestamptz` | Final time staff can submit constraints. |
| `locked_at` | `timestamptz` | Time week was locked (auto/manual). |
| `published_at` | `timestamptz` | Time a version was published. |
| `published_schedule_version_id` | `uuid` | FK to currently published row in `schedule_versions`. |

Extra constraints/indexes:
- `weeks_status_check` validates allowed status values.
- `weeks_published_schedule_version_fk` links to `schedule_versions(id)`.
- Indexes on `status`, `collection_deadline`, `published_schedule_version_id`.

## 2.2 New table: `schedule_runs`

Added by migration `0012`.

| Column | Type | Meaning |
|---|---|---|
| `id` | `uuid` PK | Run identifier. |
| `week_start` | `date` FK -> `weeks` | Week the run solves. |
| `triggered_by` | `varchar(128)` FK -> `users` | Admin who started run. |
| `status` | `varchar(20)` | `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`. |
| `started_at` | `timestamptz` | Run start timestamp. |
| `finished_at` | `timestamptz` | Run finish timestamp. |
| `error_message` | `text` | Failure reason if run failed. |
| `solver_meta` | `jsonb` | Objective/metrics/version metadata from solver. |
| `created_at` | `timestamptz` | Row creation timestamp. |

## 2.3 New table: `schedule_versions`

| Column | Type | Meaning |
|---|---|---|
| `id` | `uuid` PK | Version identifier. |
| `week_start` | `date` FK -> `weeks` | Week this version belongs to. |
| `run_id` | `uuid` FK -> `schedule_runs` | Run that produced this version. |
| `version_number` | `int` | Monotonic per week (`1`, `2`, ...). |
| `is_published` | `boolean` | Whether this version is published. |
| `created_by` | `varchar(128)` FK -> `users` | Actor that created the version. |
| `created_at` | `timestamptz` | Version creation time. |

Constraint:
- `schedule_versions_unique_week_version` keeps version numbers unique per week.

## 2.4 New table: `schedule_assignments`

| Column | Type | Meaning |
|---|---|---|
| `id` | `uuid` PK | Assignment row id. |
| `schedule_version_id` | `uuid` FK -> `schedule_versions` | Version that contains the assignment. |
| `shift_id` | `int` FK -> `shifts` | Assigned shift. |
| `user_id` | `varchar(128)` FK -> `users` | Assigned staff user. |
| `source` | `varchar(20)` | `solver` or `manual` source marker. |
| `created_at` | `timestamptz` | Assignment creation time. |

Constraint:
- `schedule_assignments_unique_assignment` prevents duplicate `(version, shift, user)`.

## 3) Function reference (new/changed scheduling flow)

This section lists main functions added/changed for Phases 1-3.

## 3.1 `server/src/services/database.service.ts`

- `withDatabaseTransaction(work)`:
  - Runs callback in DB transaction.
  - Auto `BEGIN/COMMIT/ROLLBACK`.
  - Used for atomic publish/version writes.

## 3.2 `server/src/services/auth.service.ts`

- `getFirebaseServiceAccountFromEnv()`:
  - Reads JSON credentials from `FIREBASE_SERVICE_ACCOUNT_JSON`.
- `getFirebaseServiceAccountFromPath()`:
  - Reads credentials file from `FIREBASE_SERVICE_ACCOUNT_PATH`.
- `getFirebaseAuthClient()`:
  - Initializes Firebase Admin app and returns auth client.
  - Supports env JSON/path/ADC/project fallback.
- `parseBearerToken(header)`:
  - Validates and extracts Bearer token.
- `extractUserFromToken(token)`:
  - Verifies Firebase ID token (`verifyIdToken`) and returns normalized user info.

## 3.3 `server/src/middleware/auth.middleware.ts`

- `requireAuth(req, res, next)`:
  - Async middleware that validates token via Firebase Admin.
  - Attaches `req.authUser`.

## 3.4 `server/src/services/shift.service.ts`

- `lockExpiredCollectionWeeks()`:
  - Auto-locks collecting weeks past deadline.
- `getWeekLifecycle(weekStart)`:
  - Returns week state/deadline metadata.
- `listWeeks()`:
  - Includes lifecycle fields in week list.
- `openConstraintCollection({ weekStart, collectionDeadline })`:
  - Moves week to `COLLECTING` if valid and has shifts.
- `lockWeek(weekStart)`:
  - Moves `COLLECTING -> LOCKED`.

## 3.5 `server/src/controllers/shift.controller.ts`

- `openConstraintCollection(req, res)`:
  - `POST /api/weeks/:weekStart/open-collection`
  - Validates `collection_deadline`.
- `lockWeek(req, res)`:
  - `POST /api/weeks/:weekStart/lock`.

## 3.6 `server/src/services/chat.service.ts`

- `ConstraintCollectionClosedError`:
  - Domain error for blocked constraint writes.
- `sendMessage(...)` (changed):
  - Persists constraint-intent messages.
  - Returns meaningful assistant text when constraint save blocked by phase/deadline.
- `saveConstraint(...)` (changed):
  - Calls lifecycle gate before insert.
- `ensureConstraintCollectionOpen(weekStart)`:
  - Verifies week exists, is `COLLECTING`, and deadline not passed.
  - Auto-locks expired collecting weeks.

## 3.7 `server/src/services/schedule.service.ts`

Core scheduling orchestration:

- `solveWeekDirect(weekStart)`:
  - Validates week is `LOCKED`.
  - Calls Python solver and returns assignments directly.
- `queueWeekSolve({ weekStart, triggeredBy })`:
  - Creates async run in `schedule_runs`.
- `executeQueuedRun(runId)`:
  - Transitions run state and persists produced version.
- `buildSolverPayload(weekStart)`:
  - Builds `users + shifts + constraints` payload for Python solver.
- `validateAssignments(...)`:
  - Validates solver output references valid users/shifts and deduplicates.
- `persistSolvedVersion(...)`:
  - Creates `schedule_versions` + `schedule_assignments` atomically.
- `listRunsByWeek(weekStart)`, `getRunById(runId)`:
  - Run status APIs.
- `listScheduleVersionsByWeek(weekStart)`:
  - Review list for admin.
- `getScheduleVersionDetail(versionId)`:
  - Full assignments for one version.
- `publishScheduleVersion({ versionId })`:
  - Marks selected version published, unpublishes old versions, updates `weeks`.
- `getPublishedScheduleForAdmin(weekStart)`:
  - Returns all assignments for published version.
- `getPublishedScheduleForUser({ weekStart, userId })`:
  - Returns only that user assignments for published version.

## 3.8 `server/src/controllers/schedule.controller.ts`

- `solveWeekDirect` -> `POST /solve` and `POST /api/solve`.
- `queueSolveWeek` -> `POST /api/weeks/:weekStart/solve`.
- `listRunsByWeek` -> `GET /api/weeks/:weekStart/solve-runs`.
- `getRunById` -> `GET /api/solve-runs/:runId`.
- `listScheduleVersionsByWeek` -> `GET /api/weeks/:weekStart/schedule-versions`.
- `getScheduleVersionById` -> `GET /api/schedule-versions/:versionId`.
- `publishScheduleVersion` -> `POST /api/schedule-versions/:versionId/publish`.
- `getPublishedScheduleAdmin` -> `GET /api/admin/schedule?week_start=...`.
- `getMyPublishedSchedule` -> `GET /api/my-schedule?week_start=...`.

## 3.9 `solver/solver_service.py` (new Python CP-SAT service)

- `parse_iso_datetime(value)`:
  - Parses constraint timestamps with timezone handling.
- `parse_shift_datetime(date_str, time_str)`:
  - Parses shift local datetime in Jerusalem timezone.
- `intervals_overlap(...)`:
  - Overlap predicate used by hard/soft and no-overlap constraints.
- `validate_payload(payload)`:
  - Input schema guard for `/solve`.
- `health()`:
  - `GET /health`.
- `solve()`:
  - `POST /solve`.
  - CP-SAT model:
    - Coverage constraints (doctor/nurse minimums).
    - No overlapping shifts per user.
    - Hard constraint forbids assignment.
    - Soft constraint adds penalty.
    - Fairness minimization by role load range.
  - Returns feasible/infeasible + assignments + metrics.

## 3.10 Frontend pages/components

- `client/src/pages/MySchedulePage.tsx`:
  - Staff page for published assignments (`/schedule`).
- `client/src/pages/ScheduleReviewPage.tsx`:
  - Admin page for version review + publish (`/review`).
- `client/src/App.tsx`:
  - Routes for `/schedule` and `/review`.
- `client/src/components/Sidebar.tsx`:
  - Navigation links for new pages.

## 4) Environment variables checklist

## 4.1 Server `.env` (`server/.env`)

Required for full app:

| Key | Required | Used by |
|---|---|---|
| `PORT` | Yes | Express server port. |
| `DATABASE_URL` | Yes | Postgres connection. |
| `OPENAI_API_KEY` | Yes for chat extraction | `ChatService.generateAssistantResponse`. |
| `FIREBASE_AUTH_DOMAIN` | Recommended | Firebase project context fallback. |
| `FIREBASE_PROJECT_ID` | Recommended | Firebase token verification context. |
| `SOLVER_SERVICE_URL` | Yes for solve endpoints | Node -> Python `/solve` call. |

Auth credential options (need one valid option for token verification):
- `FIREBASE_SERVICE_ACCOUNT_JSON` (recommended in dev)
- `FIREBASE_SERVICE_ACCOUNT_PATH`
- `GOOGLE_APPLICATION_CREDENTIALS`

Optional:
- `SOLVER_SERVICE_API_KEY` (if you protect solver HTTP)
- `SOLVER_REQUEST_TIMEOUT_MS` (default `60000`)
- `FIREBASE_API_KEY` (needed only for Firebase user creation endpoint in current implementation)

## 4.2 Client `.env` (`client/.env`)

Required:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

## 4.3 Python solver

No env required by default.
If you add API key auth later, sync with server `SOLVER_SERVICE_API_KEY`.

## 5) Required run sequence (local)

1. Install server deps:
```bash
cd server
npm install
```

2. Install solver deps:
```bash
cd ..
python -m pip install -r solver/requirements.txt
```

3. Apply DB migrations:
```bash
cd server
npm run migrate
```

4. Start Python solver:
```bash
cd ..
python solver/solver_service.py
```

5. Set server env:
- `SOLVER_SERVICE_URL=http://localhost:8080`

6. Start Node API:
```bash
cd server
npm run dev
```

7. Start client:
```bash
cd ../client
npm install
npm run dev
```

## 6) Automated tests

## 6.1 Server tests

Run:
```bash
cd server
npm run test
```

Added schedule tests:
- `server/src/services/schedule.service.test.ts`
  - Valid assignment normalization.
  - Unknown shift/user rejection.
  - Duplicate assignment rejection.

## 6.2 Python solver tests

Run:
```bash
python -m unittest discover -s solver -p "test_*.py"
```

Added:
- `solver/test_solver_service.py`
  - Feasible assignment case.
  - Infeasible nurse coverage case.
  - Hard constraint infeasible case.
  - Soft constraint violation case.

## 7) Manual test scenario (recommended)

1. Admin creates week + shifts in `/shifts`.
2. Admin opens collection:
   - `POST /api/weeks/:weekStart/open-collection`
3. Staff sends chat constraints in `/chat`.
4. Lock week:
   - `POST /api/weeks/:weekStart/lock`
5. Solve:
   - direct: `POST /solve` with `{ "week_start": "YYYY-MM-DD" }`
   - or queued: `POST /api/weeks/:weekStart/solve`
6. Review versions in `/review`.
7. Publish selected version from `/review`.
8. Staff checks `/schedule` for published assignments.

## 8) Current known dev limitations

- Chat still does not execute a natural-language `schedule_query` response from published schedule; it only classifies intent.
- UI uses basic table views for review/schedule (functional but not final product UX).
- No background worker process separation yet (queued run is fire-and-forget inside API process).
