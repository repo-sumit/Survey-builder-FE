# Survey Builder Frontend

React-based admin UI for creating, editing, previewing, importing, and exporting surveys.  
This frontend is designed to work with the **Survey Builder Backend** hosted separately at: `repo-sumit/Survey-builder-BE`.

> **Key integration principle:** the app calls the API via a relative base path **`/api`** and relies on **dev proxy** (local) or **platform rewrites** (prod) to route traffic to the backend.

---

## Tech Stack

- **React (CRA / react-scripts)** — Single Page App
- **React Router v6** — routing + protected routes
- **Axios** — API client with auth interceptors
- **react-datepicker** — calendar/date inputs
- **Vercel rewrites** — `/api/*` → backend service (production)

**Primary entry points**
- `src/index.jsx` — React bootstrap
- `src/App.jsx` — route map + layout shell

---

## Core Capabilities (What this UI does)

### Survey lifecycle
- Create survey (metadata/config)
- Edit survey
- List surveys
- Delete survey (with confirmation)
- Duplicate survey (create a new surveyId based on an existing one)
- Publish / Unpublish survey *(surfaced via publish state in list; publish actions are exposed via API service)*

### Question builder
- List questions for a survey
- Create / Edit / Delete questions
- Duplicate questions
- Client-side validations driven by schema rules

### Preview experience
- Survey preview rendering for multiple question types:
  - Multiple choice (single/multi)
  - Text response
  - Dropdown
  - Likert scale
  - Calendar
  - Tabular inputs (text/dropdown/checkbox)
  - Media uploads (image/video/audio/voice) *(renderer components exist; backend support required)*

### Utilities / Ops
- Import survey from file (`.xlsx`, `.xls`, `.csv`) with optional overwrite
- Export survey dump as Excel (`.xlsx`)
- Designation mapping management (CRUD + seed defaults)
- Access sheet dump + download (admin-only operations are enforced in UI)
- Admin panel (user management: create/update users)

---

## Architecture & Data Flow

### API Base URL Strategy
All API calls are made to:
- **`/api/...`** (relative), defined in `src/services/api.js`

This enables:
- **Local development** via CRA `proxy`
- **Production** via Vercel `rewrites`

### Authentication
- Login endpoint: `POST /api/auth/login`
- JWT token is stored in `localStorage` under key: `token`
- Axios request interceptor automatically adds:
  - `Authorization: Bearer <token>`
- Axios response interceptor auto-redirects to `/login` on **401** and clears token.

### Authorization (Role gating)
- Routes are protected by `ProtectedRoute`
- `requiredRole="admin"` gates the Admin Panel (`/admin`)
- Non-admin inactive users are treated as read-only in key screens (e.g., SurveyList).

---

## Local Setup

### Prerequisites
- Node.js 16+ (18+ recommended)
- npm 8+ (or compatible)

### Install
```bash
npm install
```

### Run (Dev)
```bash
npm start
```

The app will run on:
- http://localhost:3000

### Connect to Backend (Local)
This project is configured with CRA `proxy`:

- In `package.json`:
  - `"proxy": "http://localhost:5001"`

So your backend should run locally at:
- `http://localhost:5001`

> If your backend runs on another port, update the `proxy` value and restart the FE dev server.

---

## Production Deployment (Vercel)

This repo includes `vercel.json` with rewrites:

- `GET /api/:path*` → `https://survey-builder-be.onrender.com/api/:path*`
- `/(.*)` → `/index.html` (SPA fallback)

### Switching the Backend URL
To point production FE to a different backend, update `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://<YOUR-BACKEND-HOST>/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## Folder Structure

```
client/
├── public/                       # CRA public assets
├── src/
│   ├── components/
│   │   ├── AdminPanel.jsx        # Admin user management
│   │   ├── AccessSheet.jsx       # Dump/download access sheet
│   │   ├── DesignationMapping.jsx# Designation mapping CRUD
│   │   ├── ImportSurvey.jsx      # File import (xlsx/xls/csv)
│   │   ├── Login.jsx             # Auth UI
│   │   ├── Navigation.jsx        # App shell navigation
│   │   ├── ProtectedRoute.jsx    # Route guard + role gating
│   │   ├── SurveyList.jsx        # Survey listing + actions
│   │   ├── SurveyForm.jsx        # Create/edit survey
│   │   ├── QuestionList.jsx      # Question listing + actions
│   │   ├── QuestionForm.jsx      # Create/edit question
│   │   ├── DuplicateSurveyModal.jsx
│   │   ├── Toast.jsx             # Toast provider/UX
│   │   ├── TranslationPanel.jsx  # Multi-language inputs
│   │   └── preview/              # Survey preview renderers
│   ├── contexts/
│   │   └── AuthContext.jsx       # JWT decode + user state
│   ├── hooks/
│   │   └── useValidation.js      # Client validation utilities
│   ├── schemas/
│   │   ├── questionTypeSchema.js # Question types + field rules
│   │   ├── languageMappings.js   # Language/native script mappings
│   │   └── validationConstants.js
│   ├── services/
│   │   └── api.js                # Axios + API wrappers
│   ├── App.jsx                   # Routes + layout
│   ├── App.css
│   └── index.jsx
├── package.json
└── vercel.json
```

---

## Route Map (Frontend)

Defined in `src/App.jsx`:

- `/login` — Login
- `/` — Survey list
- `/surveys/new` — Create survey
- `/surveys/:surveyId/edit` — Edit survey
- `/surveys/:surveyId/questions` — Question list
- `/surveys/:surveyId/questions/new` — Create question
- `/surveys/:surveyId/questions/:questionId/edit` — Edit question
- `/surveys/:surveyId/preview` — Preview survey
- `/import` — Import survey file
- `/designations` — Designation mapping
- `/access-sheet` — Access sheet dump/download
- `/admin` — Admin user management (**admin-only**)

---

## API Endpoints Used by Frontend

From `src/services/api.js` and relevant components:

### Auth
- `POST /api/auth/login`

### Surveys
- `GET /api/surveys`
- `GET /api/surveys/:surveyId`
- `POST /api/surveys`
- `PUT /api/surveys/:surveyId`
- `DELETE /api/surveys/:surveyId`
- `POST /api/surveys/:surveyId/duplicate`

### Questions
- `GET /api/surveys/:surveyId/questions`
- `POST /api/surveys/:surveyId/questions`
- `PUT /api/surveys/:surveyId/questions/:questionId`
- `DELETE /api/surveys/:surveyId/questions/:questionId`
- `POST /api/surveys/:surveyId/questions/:questionId/duplicate`

### Locking (concurrency control)
- `POST /api/surveys/:surveyId/lock`
- `DELETE /api/surveys/:surveyId/lock`
- `GET /api/surveys/:surveyId/lock`

### Publish
- `POST /api/surveys/:surveyId/publish`
- `POST /api/surveys/:surveyId/unpublish`

### Export
- `GET /api/export/:surveyId` → downloads `{surveyId}_dump.xlsx`

### Import
- `POST /api/import` (multipart)
- `POST /api/import?overwrite=true` (multipart)

### Designation Mapping
- `GET /api/designations?stateCode=XX&activeOnly=true`
- `POST /api/designations`
- `PATCH /api/designations/:designationId`
- `POST /api/designations/seed-defaults`

### Access Sheet
- `POST /api/access-sheet/dump`
- `GET /api/access-sheet/latest?stateCode=XX`
- `GET /api/access-sheet/latest/download?stateCode=XX` → downloads `.xlsx`

### Validation
- `POST /api/validate-upload?schema=<schema>` (multipart)
- `GET /api/validation-schema`

---

## Active vs Inactive (Practical Guidance)

**Active (wired end-to-end in FE):**
- Login + protected navigation
- Survey CRUD + duplicate
- Question CRUD + duplicate
- Preview route with multiple renderers
- Import/export flows (UI + API calls)
- Admin panel, designation mapping, access sheet screens

**Potentially inactive / backend-dependent:**
- Publish/unpublish and lock endpoints are implemented in the FE API layer; confirm backend availability.
- Media upload question types have renderer components; confirm backend storage + submission contract.

---

## Common Troubleshooting

### 1) FE runs but API calls fail (404/500)
- Confirm backend is running (local) at the port in `"proxy"` (default `5001`)
- Confirm backend exposes `/api/...` routes (the FE always calls `/api`)
- For production, confirm `vercel.json` rewrite points to a live backend host

### 2) Redirect loop to `/login`
- Token expired or invalid JWT payload
- Clear storage and login again:
  - `localStorage.removeItem('token')`

### 3) CORS issues (local backend)
- CRA proxy usually bypasses CORS. If you disabled proxy, backend must allow `http://localhost:3000`.

---

## Scripts

```bash
npm start   # dev server
npm run build
npm test
npm run eject
```

---

## License
TBD
