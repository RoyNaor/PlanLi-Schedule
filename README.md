# 📅 AI-Based Medical Scheduling System

An intelligent medical staff scheduling platform that combines:

- 🧠 Natural language understanding (LLM)
- ⚙️ Constraint optimization (Google OR-Tools CP-SAT)
- 🔐 Firebase authentication
- 🗄️ PostgreSQL (Supabase-compatible)

## 🎯 Vision

Build an automated scheduling system for medical teams that can:

1. Collect constraints in natural language (for example: *"I can't work Thursday evening"*).
2. Convert each constraint into structured JSON using an LLM.
3. Build a mathematical optimization model.
4. Generate a fair, high-quality schedule with CP-SAT.

## 🏗️ Architecture

### Frontend (React)

- **Framework:** React
- **Styling:** Tailwind CSS
- **State Management:** Hooks + Context
- **Authentication:** Firebase Client SDK
- **Calendar UI:** `react-big-calendar`

### Backend (Node.js + Python)

#### Node.js service

- API gateway
- Firebase token verification
- Route orchestration
- Communication with the Python solver service

#### Python service

- OpenAI integration (`gpt-4o-mini`)
- OR-Tools CP-SAT model + solver
- Scheduling business logic

### Infrastructure

- **Authentication:** Firebase Auth (Email/Password)
- **Database:** PostgreSQL (Supabase recommended)
- **Server-side auth verification:** Firebase Admin SDK

## 🔐 Authentication Flow

1. The user logs in through Firebase on the frontend.
2. Firebase returns an ID token.
3. Each API request includes:

```http
Authorization: Bearer <firebase_id_token>
```

4. The Node.js backend verifies the token with Firebase Admin.
5. The backend extracts the `uid` and uses it for user-scoped DB operations.

## 🗄️ Database Schema

```sql
CREATE TABLE users (
    id VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255),
    full_name VARCHAR(255),
    role VARCHAR(50),
    seniority_level INT DEFAULT 1
);

CREATE TABLE constraints (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(128) REFERENCES users(id),
    raw_text TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    constraint_type VARCHAR(20),
    weight INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE shifts_config (
    id SERIAL PRIMARY KEY,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    required_doctors INT DEFAULT 1
);

CREATE TABLE final_schedule (
    id SERIAL PRIMARY KEY,
    shift_id INT REFERENCES shifts_config(id),
    user_id VARCHAR(128) REFERENCES users(id),
    generated_at TIMESTAMP DEFAULT NOW()
);
```

## 🖥️ UI Scope

### ✅ Login Screen

- Firebase Email/Password sign-in
- Role-based routing

### ✅ Doctor Chat Screen

- Free-text constraint input
- AI-powered extraction of scheduling constraints
- Confirmation card with:
  - Date
  - Time
  - Constraint type (HARD / SOFT)
  - Actions: **Confirm**, **Edit**, **Delete**

### ✅ Admin Dashboard

- **Generate Schedule** action
- Calendar-based schedule view
- KPI widgets:
  - % of honored constraints
  - Fairness score

## 🌐 API Design

### `POST /api/analyze-text`

Extract a structured constraint from natural language.

**Request**

```json
{
  "text": "I can't work Tuesday evening",
  "user_id": "abc123"
}
```

**Response**

```json
{
  "start_time": "2026-03-03T18:00:00Z",
  "end_time": "2026-03-03T23:00:00Z",
  "constraint_type": "HARD",
  "weight": 80
}
```

### `POST /api/save-constraint`

Persist a user-confirmed constraint.

### `POST /api/solve-schedule`

Generate and store an optimized schedule for a selected date range.

**Request**

```json
{
  "start_date": "2026-03-01",
  "end_date": "2026-03-07"
}
```

**Solver pipeline**

1. Fetch doctors.
2. Fetch constraints.
3. Build the CP-SAT model.
4. Solve the optimization problem.
5. Persist assignments to `final_schedule`.

**Response**

```json
[
  {
    "shift_id": 1,
    "user_id": "abc123"
  }
]
```
