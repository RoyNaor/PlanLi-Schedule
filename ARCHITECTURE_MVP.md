# ARCHITECTURE_MVP.md

## AI-Based Conversational Medical Scheduling – Hackathon MVP

> **Goal:** Build a realistic, impressive, end-to-end demo in 48 hours with **conversational AI + real optimization + visible schedule output**.

---

## 1) High-Level Architecture Diagram (ASCII)

```text
┌────────────────────────────────────────────────────────────────────┐
│                           React Frontend                           │
│  - Firebase Email/Password Login                                   │
│  - Private Staff Chat (Doctor/Nurse)                               │
│  - Admin Week Setup + Generate                                     │
│  - Calendar Screen (react-big-calendar)                            │
└───────────────────────────────┬────────────────────────────────────┘
                                │ HTTPS/JSON + Firebase ID Token
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                         Node.js API Service                        │
│  - Verify Firebase token + role checks                             │
│  - Persist chat/constraints/schedule in SQLite                     │
│  - Orchestrate Python AI/Solver calls                              │
│  - Trigger email notifications via Resend                          │
└───────────────────────────────┬────────────────────────────────────┘
                                │ Internal HTTP
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
┌────────────────────────────────┐   ┌───────────────────────────────┐
│      Python AI/Solver Service  │   │         SQLite Database       │
│  - GPT-4o-mini intent/extract  │   │ users                         │
│  - GPT-4o-mini response format │   │ conversations/messages         │
│  - OR-Tools CP-SAT optimizer   │   │ constraints/shifts/schedule    │
└────────────────────────────────┘   └───────────────────────────────┘

External services:
  Firebase Auth (email/password)
  Resend (outbound email)
```

**Why this split for MVP:**
- React stays fast to build.
- Node handles auth verification, DB, and integration glue.
- Python keeps LLM + OR-Tools logic in one place.
- SQLite keeps setup friction low for a 48-hour demo.

---

## 2) System Components

### A) Staff Chat (Core Feature: Doctor + Nurse)

**Purpose:** each staff member (doctor or nurse) has a private persistent AI chat for schedule constraints and schedule Q&A.

**How it works (MVP):**
1. Staff logs in with Firebase email/password.
2. Frontend sends Firebase ID token with every API request.
3. Node validates token and maps `firebase_uid -> users.id`.
4. Staff messages are saved in `messages` under a private `conversation`.
5. Node sends latest message + short history to Python (`GPT-4o-mini`).
6. LLM classifies intent:
   - `constraint`
   - `schedule_query`
   - `other`
7. If `constraint`, LLM returns structured JSON with **HARD** or **SOFT**.
8. UI asks for confirmation before saving constraint.
9. On confirm, Node saves to `constraints`.

**MVP design choices:**
- One conversation thread per staff user.
- Explicit confirmation before write.
- Strict JSON schema for extraction reliability.

---

### B) Admin Screen

**Purpose:** set up one week and generate schedule for both doctors and nurses.

**Features (MVP):**
- Select week start date.
- Create shifts for week (e.g., morning/evening/night).
- Set min required counts (general count for MVP).
- Click **Generate Schedule**.

**Backend behavior:**
- Node requests Python CP-SAT solve with users + shifts + constraints.
- Solver enforces HARD constraints.
- Solver tries to satisfy SOFT constraints via penalty minimization.
- Solver writes assignments into `final_schedule`.
- Node sends email summary using Resend (e.g., "Schedule published").

---

### C) Schedule Screen

**Staff view (doctor or nurse):**
- Show only logged-in user assignments.

**Admin view:**
- Show all assignments.

**UI tech:**
- `react-big-calendar` events sourced from API.

---

## 3) Conversation Flow

### Example 1: Constraint extraction

Staff says:
> “I can’t work Tuesday evening.”

Flow:
1. Frontend calls `POST /api/chat`.
2. Node stores user message.
3. Node forwards context to Python LLM.
4. LLM returns:

```json
{
  "intent": "constraint",
  "constraint": {
    "start_time": "2026-01-06T17:00:00",
    "end_time": "2026-01-06T23:00:00",
    "priority": "HARD",
    "reason": "Unavailable Tuesday evening"
  },
  "assistant_text": "Got it — should I save Tuesday evening as a HARD unavailability constraint?"
}
```

5. User confirms.
6. Frontend calls `POST /api/save-constraint`.
7. Node persists in `constraints`.

### Example 2: Soft preference

Staff says:
> “Prefer not to work Friday night if possible.”

LLM extracts:

```json
{
  "intent": "constraint",
  "constraint": {
    "start_time": "2026-01-09T23:00:00",
    "end_time": "2026-01-10T07:00:00",
    "priority": "SOFT",
    "reason": "Preference to avoid Friday night"
  }
}
```

After confirm, saved as soft preference used in objective penalties.

### Example 3: Schedule query

Staff says:
> “When do I work this week?”

Flow:
1. `POST /api/chat`.
2. LLM intent = `schedule_query`.
3. Node reads user assignments from `final_schedule`.
4. Node asks Python to format concise natural-language summary.
5. Reply returned in chat.

---

## 4) Solver Flow (OR-Tools CP-SAT)

When admin presses **Generate Schedule**:

1. Fetch staff (`users` where role in `doctor`, `nurse`).
2. Fetch week shifts.
3. Fetch week constraints (hard + soft).
4. Build model:
   - Binary var `x[u,s]` = user `u` assigned to shift `s`.
   - Coverage: each shift has at least `min_required` staff.
   - HARD constraints: forbid assignments in blocked windows.
   - SOFT constraints: add penalty vars for violations.
   - Light balancing objective: minimize penalties + assignment imbalance.
5. Solve with short limit (10–20s).
6. Persist feasible assignments to `final_schedule`.
7. Trigger Resend email notification to all scheduled users.

**MVP note:** priority is feasible, understandable output over sophisticated optimization.

---

## 5) Minimal Database Schema (SQLite)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('doctor', 'nurse', 'admin')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('staff', 'assistant')),
  content TEXT NOT NULL,
  intent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE constraints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  week_start DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('HARD', 'SOFT')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  min_required INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE final_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start DATE NOT NULL,
  shift_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 6) API Endpoints (MVP Only)

> All protected endpoints require Firebase Bearer token, verified in Node.

### `POST /api/chat`
Input:
```json
{ "message": "I can't work Tuesday evening." }
```
Output:
```json
{
  "assistant_text": "...",
  "intent": "constraint",
  "extracted_constraint": {
    "start_time": "...",
    "end_time": "...",
    "priority": "HARD"
  }
}
```

### `POST /api/save-constraint`
Input:
```json
{
  "week_start": "2026-01-05",
  "start_time": "2026-01-06T17:00:00",
  "end_time": "2026-01-06T23:00:00",
  "priority": "SOFT",
  "reason": "Prefer to avoid evening"
}
```
Output:
```json
{ "ok": true, "constraint_id": 10 }
```

### `POST /api/generate-schedule`
Input:
```json
{ "week_start": "2026-01-05" }
```
Output:
```json
{ "ok": true, "assigned": 24, "soft_violations": 2, "message": "Schedule generated" }
```

### `GET /api/my-schedule?week_start=2026-01-05`
Output: shifts assigned to authenticated staff user.

### `GET /api/admin/schedule?week_start=2026-01-05`
Output: all assignments for admin calendar view.

---

## 7) Folder Structure (Hackathon Ready)

```text
/apps
  /web
    /src
      /pages            # login, chat, admin, calendar
      /lib/firebase.ts  # Firebase client config
/services
  /api
    /src
      /middleware/auth.ts      # Firebase token verification
      /integrations/resend.ts  # email sender wrapper
      /routes
  /ai-solver
    /app
      llm.py
      solver.py
/database
  schema.sql
  seed.sql
```

**Keep it small:** three deployable services (web/api/ai-solver) + SQLite file.

---

## 8) What We Intentionally Skip

- Advanced multi-week fairness optimization
- Shift swap marketplace/workflow
- Auto-deadline locking and policy engine
- SMS/push channels (email only via Resend in MVP)
- Department-specific credentialing rules
- Full RBAC admin panel hardening

---

## 9) Demo Script (2–4 Minutes)

1. Log in with Firebase email/password as **Doctor A**.
2. In chat, enter a **HARD** constraint: “I can’t work Tuesday evening.” Confirm save.
3. Enter a **SOFT** preference: “Prefer not Friday night.” Confirm save.
4. Log in as **Nurse B**, add one soft preference.
5. Switch to **Admin** account.
6. Configure shifts for week and click **Generate Schedule**.
7. Show admin calendar with assignments for both doctors and nurses.
8. Trigger/send schedule publish email (Resend) and show success toast.
9. Switch back to Doctor A chat: ask “When do I work this week?”
10. Show natural-language response + doctor calendar matching the answer.

**Demo impact:** proves auth + persistent conversational constraints + hard/soft CP-SAT optimization + cross-role scheduling + visible calendar + email publish signal.

---

## Implementation Notes (48h Pragmatism)

- Use `GPT-4o-mini` with strict JSON schema output for extraction.
- Hard fail safe: if extraction is ambiguous, ask clarification instead of saving.
- Keep one-week scope only.
- Seed small dataset (e.g., 5 doctors, 4 nurses, 1 admin).
- Resend usage is minimal: one schedule-published email template.
- Prefer stability and a polished demo path over feature breadth.
