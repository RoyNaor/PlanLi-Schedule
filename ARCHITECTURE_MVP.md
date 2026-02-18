# ARCHITECTURE_MVP.md

## AI-Based Conversational Medical Scheduling – Hackathon MVP

> **Goal:** Build a realistic, impressive, end-to-end demo in 48 hours with **conversational AI + real optimization + visible schedule output**.

---

## 1) High-Level Architecture Diagram (ASCII)

```text
┌───────────────────────────────────────────────────────────────────┐
│                           React Frontend                          │
│  - Login (mock role: Doctor/Admin)                               │
│  - Doctor Chat UI                                                 │
│  - Admin Generate UI                                              │
│  - Calendar Screen (react-big-calendar)                           │
└──────────────────────────────┬────────────────────────────────────┘
                               │ HTTP/JSON
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│                        Node.js API Service                        │
│  - Routes + orchestration                                         │
│  - Loads/saves chat, constraints, schedules                       │
│  - Calls Python AI/Solver service                                 │
└──────────────────────────────┬────────────────────────────────────┘
                               │ Internal HTTP
                ┌──────────────┴───────────────┐
                ▼                              ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│      Python AI/Solver Service │   │         SQLite Database       │
│  - LLM intent + extraction    │   │ users                         │
│  - LLM response formatting    │   │ conversations/messages         │
│  - OR-Tools CP-SAT optimizer  │   │ constraints/shifts/schedule    │
└───────────────────────────────┘   └───────────────────────────────┘
```

**Why this split for MVP:**
- Keep frontend simple and fast in React.
- Keep API logic lightweight in Node.
- Put AI + optimization in Python where OR-Tools integration is easiest.
- Use **SQLite** for speed of setup and portability during hackathon demo.

---

## 2) System Components

### A) Doctor Chat (Core Feature)

**Purpose:** each doctor has a private persistent AI chat that captures scheduling constraints and answers schedule questions.

**How it works (MVP):**
1. Doctor opens chat session tied to `doctor_user_id`.
2. Messages are stored in DB (`messages` table).
3. Node sends latest user message + short conversation history to Python LLM endpoint.
4. LLM classifies intent:
   - `constraint`
   - `schedule_query`
   - `other` (fallback small talk/help)
5. If `constraint`, LLM returns structured JSON (time window + hardness + note).
6. UI asks doctor to confirm (“Save this constraint?”).
7. On confirm, Node saves to `constraints`.
8. Chat history remains available for context in future turns.

**MVP design decisions:**
- One conversation per doctor for hackathon simplicity.
- Constraint save requires explicit confirmation to avoid accidental bad data.
- Keep extraction schema small and strict for reliability.

---

### B) Admin Screen

**Purpose:** create and generate one fixed-week schedule.

**Features (MVP):**
- Select target week (single active week).
- Define shifts for that week (e.g., morning/evening blocks).
- Set minimum doctors required per shift.
- Click **Generate Schedule**.

**Backend behavior:**
- Node calls Python solver endpoint.
- Python CP-SAT builds optimization model using:
  - doctors
  - shifts
  - HARD constraints
- Solver assigns doctors to shifts while satisfying requirements.
- Result persisted to `final_schedule`.

---

### C) Schedule Screen

**Purpose:** show final published assignments in a visible calendar.

**Doctor view:**
- Shows only shifts assigned to logged-in doctor.

**Admin view:**
- Shows all doctors’ assignments.

**UI tech:**
- `react-big-calendar` with events from API.

---

## 3) Conversation Flow

### Example 1: Constraint extraction

Doctor says:
> “I can't work Tuesday evening.”

Flow:
1. Frontend sends message to `POST /api/chat`.
2. Node stores message.
3. Node forwards context + message to Python LLM.
4. LLM returns:

```json
{
  "intent": "constraint",
  "constraint": {
    "start_time": "2026-01-06T17:00:00",
    "end_time": "2026-01-06T23:00:00",
    "type": "HARD",
    "reason": "Doctor unavailable Tuesday evening"
  },
  "assistant_text": "I understood that you are unavailable Tuesday evening. Should I save this as a hard constraint?"
}
```

5. Doctor confirms.
6. Frontend calls `POST /api/save-constraint`.
7. Node persists row in `constraints`.

---

### Example 2: Schedule question

Doctor says:
> “When do I work this week?”

Flow:
1. `POST /api/chat` sent.
2. LLM classifies `intent = schedule_query`.
3. Node fetches doctor’s assignments from `final_schedule`.
4. Node sends schedule rows to Python for natural-language formatting.
5. Assistant replies with concise weekly summary.

---

## 4) Solver Flow (OR-Tools CP-SAT)

When admin clicks **Generate Schedule**:

1. Fetch doctors (`users` where role=doctor).
2. Fetch week shifts (`shifts`).
3. Fetch active constraints (`constraints`) for that week.
4. Build CP-SAT model:
   - Binary var `x[d,s]` = doctor `d` assigned to shift `s`.
   - Coverage: each shift must have at least `min_required` doctors.
   - HARD constraints: forbid assignments where doctor unavailable.
   - Optional light objective for MVP: minimize total assignments spread variance (simple balance).
5. Solve within short time limit (e.g., 10–20s).
6. If feasible, write assignments to `final_schedule` (replace previous for that week).
7. Return summary (#assigned, uncovered shifts if any).

**MVP note:** keep objective simple; correctness + demo clarity > advanced fairness.

---

## 5) Minimal Database Schema (SQLite)

```sql
-- users: mock login identity
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('doctor', 'admin'))
);

-- one private thread per doctor (MVP: single conversation)
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_user_id) REFERENCES users(id)
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('doctor', 'assistant')),
  content TEXT NOT NULL,
  intent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE constraints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_user_id INTEGER NOT NULL,
  week_start DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('HARD')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_user_id) REFERENCES users(id)
);

-- shift templates for one week instance
CREATE TABLE shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  min_required INTEGER NOT NULL DEFAULT 1
);

-- final published schedule
CREATE TABLE final_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start DATE NOT NULL,
  shift_id INTEGER NOT NULL,
  doctor_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  FOREIGN KEY (doctor_user_id) REFERENCES users(id)
);
```

---

## 6) API Endpoints (MVP Only)

### `POST /api/chat`
Input:
```json
{ "user_id": 2, "message": "I can't work Tuesday evening." }
```
Output:
```json
{
  "assistant_text": "...",
  "intent": "constraint",
  "extracted_constraint": { "start_time": "...", "end_time": "...", "type": "HARD" }
}
```

### `POST /api/save-constraint`
Input:
```json
{
  "user_id": 2,
  "week_start": "2026-01-05",
  "start_time": "2026-01-06T17:00:00",
  "end_time": "2026-01-06T23:00:00",
  "type": "HARD",
  "reason": "Unavailable Tuesday evening"
}
```
Output: `{ "ok": true, "constraint_id": 10 }`

### `POST /api/generate-schedule`
Input:
```json
{ "week_start": "2026-01-05" }
```
Output:
```json
{ "ok": true, "assigned": 24, "message": "Schedule generated" }
```

### `GET /api/my-schedule?user_id=2&week_start=2026-01-05`
Output: assigned shifts for one doctor.

### `GET /api/admin/schedule?week_start=2026-01-05`
Output: all assignments for calendar/admin table.

---

## 7) Folder Structure (Hackathon Ready)

```text
/apps
  /web                  # React + Tailwind + calendar + chat/admin pages
/services
  /api                  # Node.js routes, DB access, orchestration
  /ai-solver            # Python FastAPI/Flask: LLM + OR-Tools solver
/shared
  /types                # optional shared DTOs/json schemas
/database
  schema.sql            # SQLite schema
  seed.sql              # demo users + sample shifts
```

**Keep it small:** one repo, three runnable services max (web/api/ai-solver).

---

## 8) What We Intentionally Skip (Out of Scope for 48h)

- Advanced fairness optimization (preferences weighting, equity across months)
- Shift swap/trade workflow between doctors
- Real authentication/authorization (use mock role selection)
- Deadline automation and lock windows
- Notifications (email/SMS/push)
- Multi-hospital / multi-department complexity
- Full audit/compliance features

These are explicitly deferred to keep MVP stable and demo-ready.

---

## 9) Demo Script (2–4 Minutes)

1. **Login as Doctor A** (mock selector).
2. Open chat and type: “I can’t work Tuesday evening.”
3. Show assistant’s extracted constraint and click **Confirm Save**.
4. Switch to **Admin** view.
5. Show configured week shifts and click **Generate Schedule**.
6. Open admin calendar: display generated assignments.
7. Switch back to **Doctor A**.
8. Ask chat: “When do I work this week?”
9. Assistant responds with natural-language summary from `final_schedule`.
10. Open doctor calendar view to visually confirm same assignments.

**Demo impact:** proves persistent conversational input → structured constraints → real solver → visible calendar outcome.

---

## Implementation Notes (MVP Pragmatism)

- Use deterministic prompt templates for extraction to reduce hallucinations.
- Keep constraint schema strict (`HARD` only) in MVP.
- If solver finds infeasible schedule, return clear admin message and highlight uncovered shifts.
- Seed 4–8 doctors and one sample week to guarantee a smooth demo.
- Prefer reliability over breadth: one polished end-to-end path beats many partial features.
