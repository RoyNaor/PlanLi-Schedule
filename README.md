📅 AI-Based Medical Scheduling System
=====================================

מערכת שיבוץ רפואית חכמה המבוססת על שילוב של:

*   🧠 הבנת שפה טבעית (LLM)
    
*   ⚙️ מנוע אופטימיזציה (Google OR-Tools)
    
*   🔐 אימות Firebase
    
*   🗄️ PostgreSQL (Supabase)
    

🎯 Vision
---------

יצירת מערכת שיבוץ אוטומטית לצוותים רפואיים המשלבת:

1.  קליטת אילוצים בשפה טבעית (לדוגמה: "אני לא יכול בחמישי בערב")
    
2.  תרגום האילוץ ל-JSON מובנה באמצעות LLM
    
3.  בניית מודל מתמטי
    
4.  יצירת לוח זמנים אופטימלי והוגן באמצעות CP-SAT Solver
    

🏗 Architecture
===============

Frontend (React)
----------------

*   Framework: React
    
*   Styling: TailwindCSS
    
*   State: Hooks + Context
    
*   Auth: Firebase Client SDK
    
*   Calendar: react-big-calendar
    

Backend (Node + Python)
-----------------------

### Node.js

*   API Gateway
    
*   Token verification
    
*   Routing
    
*   Communication with Python service
    

### Python

*   OpenAI integration (GPT-4o-mini)
    
*   OR-Tools CP-SAT Solver
    
*   Business logic
    

Infrastructure
--------------

*   Authentication: Firebase Auth (Email/Password)
    
*   Database: PostgreSQL (Supabase recommended)
    
*   Firebase Admin SDK (Server-side verification)
    

🔐 Auth Flow
============

1.  User logs in via Firebase (Frontend).
    
2.  Firebase returns ID Token.
    
3.  Every API call sends:
    

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`Authorization: Bearer` 

1.  Node verifies token using Firebase Admin.
    
2.  UID is extracted and used for DB operations.
    

🗄 Database Schema
==================

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   CREATE TABLE users (      id VARCHAR(128) PRIMARY KEY,      email VARCHAR(255),      full_name VARCHAR(255),      role VARCHAR(50),      seniority_level INT DEFAULT 1  );  CREATE TABLE constraints (      id SERIAL PRIMARY KEY,      user_id VARCHAR(128) REFERENCES users(id),      raw_text TEXT,      start_time TIMESTAMP NOT NULL,      end_time TIMESTAMP NOT NULL,      constraint_type VARCHAR(20),      weight INT DEFAULT 10,      created_at TIMESTAMP DEFAULT NOW()  );  CREATE TABLE shifts_config (      id SERIAL PRIMARY KEY,      start_time TIMESTAMP,      end_time TIMESTAMP,      required_doctors INT DEFAULT 1  );  CREATE TABLE final_schedule (      id SERIAL PRIMARY KEY,      shift_id INT REFERENCES shifts_config(id),      user_id VARCHAR(128) REFERENCES users(id),      generated_at TIMESTAMP DEFAULT NOW()  );   `

🖥 UI Scope
===========

🟢 Login Screen
---------------

*   Firebase Email/Password
    
*   Role-based routing
    

🟢 Doctor Chat Screen
---------------------

*   Free text input
    
*   AI extracts constraint
    
*   Confirmation card:
    
    *   Date
        
    *   Time
        
    *   HARD / SOFT
        
    *   \[Confirm\] \[Edit\] \[Delete\]
        

🟢 Admin Dashboard
------------------

*   Generate Schedule Button
    
*   Calendar View
    
*   KPIs:
    
    *   % honored constraints
        
    *   Fairness score
        

🌐 API Design
=============

POST /api/analyze-text
----------------------

Input:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "text": "אני לא יכול בשלישי בערב",    "user_id": "abc123"  }   `

Output:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "start_time": "...",    "end_time": "...",    "constraint_type": "HARD",    "weight": 80  }   `

POST /api/save-constraint
-------------------------

Stores confirmed constraint.

POST /api/solve-schedule
------------------------

Input:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "start_date": "2026-03-01",    "end_date": "2026-03-07"  }   `

Process:

1.  Fetch doctors
    
2.  Fetch constraints
    
3.  Build CP-SAT model
    
4.  Solve
    
5.  Save to final\_schedule
    

Output:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   [    {      "shift_id": 1,      "user_id": "abc123"    }  ]   `
