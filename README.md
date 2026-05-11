# Survey Builder Frontend (`fmb-survey-builder-client`)

React 18 single-page app for the **FMB Survey Builder** platform. It is the admin/editor UI: it authenticates state and admin users, lets them author and validate multi-language surveys, runs an Excel import/export round-trip, and provides a fully-fledged read-only Survey Preview that mirrors the runtime experience.

> **Companion service**: the backend lives in [`../Survey-builder-BE`](../Survey-builder-BE).
> **Project-wide overview**: see the [root README](../README.md).

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Tech Stack](#tech-stack)
4. [Architecture](#architecture)
5. [Repository Structure](#repository-structure)
6. [Routing](#routing)
7. [Application Logic](#application-logic)
8. [API Surface Used](#api-surface-used)
9. [Validation Rules (Frontend mirror)](#validation-rules-frontend-mirror)
10. [Environment Variables](#environment-variables)
11. [Installation](#installation)
12. [Running the Project](#running-the-project)
13. [Testing](#testing)
14. [Deployment](#deployment)
15. [Security & Permissions](#security--permissions)
16. [Error Handling & Logging](#error-handling--logging)
17. [Known Constraints](#known-constraints)
18. [Future Improvements](#future-improvements)
19. [Contribution Guidelines](#contribution-guidelines)

---

## Overview

This frontend is consumed by two distinct user roles:

- **Admin** — global access to user management, state-config, designation hierarchy, access-sheet operations.
- **State user** — scoped to one `stateCode`. Can manage that state's surveys when `is_active=true`; read-only otherwise.

All API calls are made to the **relative path `/api/*`**. In local development the CRA `proxy` (`http://localhost:5001`) routes those calls to the backend. In production, `vercel.json` rewrites them to the deployed backend host.

---

## Key Features

### Survey lifecycle
- Create / edit / list / delete surveys.
- Duplicate a survey from any existing one.
- Publish & unpublish (gated by `REACT_APP_FEATURE_PUBLISH=true`).
- Concurrency locking: the question-master screen acquires a 15-minute lock on mount and releases it on unmount; another user editing the same survey is surfaced via a `lock-warning` banner.

### Question authoring
- 12 question types — Multiple Choice (Single/Multi), Tabular Text Input, Tabular Drop Down, Tabular Check Box, Text Response, Image / Video / Voice upload, Likert Scale, Calendar, Drop Down.
- Field visibility per type defined in `src/schemas/questionTypeSchema.js`.
- Parent–child branching via `OptionXChildren`. The form auto-prefixes child IDs (e.g. typing inside a child input on `Q2.1` auto-fills `Q2.1.` and re-injects the prefix after each comma).
- Mandatory child enforcement: a child cannot be `isMandatory='Yes'` if its parent is not also `Yes`. The form auto-resets and disables the dropdown.
- Subtree-aware **Duplicate Question** — duplicating `Q2.1` as `Q3` also clones `Q2.1.1 → Q3.1`, `Q2.1.2 → Q3.2`, including all `OptionXChildren` references and `sourceQuestion` remapping.
- Per-language translations panel powered by `TranslationPanel.jsx`; optional auto-translate via the backend's `/api/translate` proxy.

### Survey preview
The Preview flow (`src/components/preview/SurveyPreview.jsx`) is a full multi-step onboarding mock plus question runner:

1. **User ID login** — numeric input. Five dummy users (`1001`–`1005`) match against a hard-coded table.
2. **Verify Your Details** — confirms Name / User ID / Designation; Continue or Go Back.
3. **Language Selection** — modal popup, only when the survey has multiple languages.
4. **School UDISE** — only when `survey.inSchool === 'Yes'`. Numeric input → dummy "School Verified" card → Proceed.
5. **Question runner** — per-question navigation, mandatory-field check, parent-child gating, completion screen.

Each question type has its own renderer under `src/components/preview/`.

### Excel import / Dumpsheet validator
- **Import** is two-phase:
  - **Preview File** parses + validates everything without persisting and lets the user pick *which* surveys to import.
  - **Import Selected** posts the file again with `?surveyIds=…` to commit only the chosen surveys.
- **Validator** (`/validator`) uses the same parsing pipeline and shows errors only for rows where `Mode` is `Correction` or `New Data`. Persists nothing. Supports a **Clear** button and a **Re-upload & Validate** flow.
- Both screens share the same error table: per-column "Search…" filters, type filter (Survey / Question / All), and a **Download CSV** button that exports the currently displayed errors.

### Other utilities
- **Designation hierarchy** screen (admin: full CRUD; state-only-active: limited).
- **Access Sheet** screen — generate, download, and re-upload state-scoped XLSX dumps.
- **Admin Panel** — user management + state configuration.

### UX niceties
- Toast notifications via `useToast()` from `Toast.jsx`.
- Lazy-loaded routes (`React.lazy`) with a custom `<PageLoader />` Suspense fallback.
- A water + fish CSS/JS animation on the upload card (`WaterAnimation.jsx`) plays during long preview/import/validate calls.
- Error boundaries via `ErrorBoundary.jsx`.
- All view state is React local state or Context — no Redux.

---

## Tech Stack

| Concern | Technology |
|---|---|
| Framework | **React 18.2** |
| Routing | **React Router DOM v6** |
| Server-state cache | **`@tanstack/react-query` v5** |
| HTTP client | **Axios 1.6** |
| UI | **Bootstrap 5.3** + custom CSS in `src/App.css` |
| Date input | `react-datepicker` |
| Build tool | **Create React App** (`react-scripts` 5.0.1) |
| Lang | JavaScript / JSX |
| Linting | ESLint via CRA's `react-app` preset |
| Tests | Jest + React Testing Library (CRA-bundled, **no tests yet**) |

---

## Architecture

### Layering
```
src/components/  →  src/services/api.js  →  Backend /api/*
                ↘  src/contexts/AuthContext   (token, user, login/logout)
                ↘  src/hooks/useValidation    (client-side form errors)
                ↘  src/schemas/              (question-type field rules + i18n maps)
```

### State management
- **No Redux / Zustand**. Local `useState` plus two Contexts:
  - `AuthContext` — JWT decode, user object, login/logout, expiry detection.
  - `ToastContext` (inside `Toast.jsx`) — global toast queue.
- **Server state** is fetched via `@tanstack/react-query`, particularly inside `QuestionList`, `QuestionForm`, and `SurveyList`.

### Auth flow
1. `Login.jsx` calls `authAPI.login(...)` → JWT.
2. Token stored in `localStorage` under `token`.
3. Axios request interceptor adds `Authorization: Bearer <token>` to every request.
4. Response interceptor: any `401` (except on `/auth/login`) clears the token and bounces the user to `/login`.

### Lazy loading

```jsx
const SurveyList     = lazy(() => import('./components/SurveyList'));
const ImportSurvey   = lazy(() => import('./components/ImportSurvey'));
const DumpsheetValidator = lazy(() => import('./components/DumpsheetValidator'));
// …
<Suspense fallback={<PageLoader />}><Routes>…</Routes></Suspense>
```

---

## Repository Structure

```
Survey-builder-FE/
├── public/
│   ├── index.html              # SPA root
│   └── fish.svg                # used by WaterAnimation
├── src/
│   ├── components/
│   │   ├── preview/            # one renderer per question type + SurveyPreview
│   │   │   ├── SurveyPreview.jsx
│   │   │   ├── QuestionRenderer.jsx
│   │   │   ├── PreviewNavigation.jsx
│   │   │   ├── CalendarRenderer.jsx
│   │   │   ├── DropDownRenderer.jsx
│   │   │   ├── LikertScaleRenderer.jsx
│   │   │   ├── MediaUploadRenderer.jsx
│   │   │   ├── MultipleChoiceSingleRenderer.jsx
│   │   │   ├── MultipleChoiceMultiRenderer.jsx
│   │   │   ├── TextResponseRenderer.jsx
│   │   │   ├── TabularTextInputRenderer.jsx
│   │   │   ├── TabularDropDownRenderer.jsx
│   │   │   └── TabularCheckBoxRenderer.jsx
│   │   ├── AdminPanel.jsx          # user + state config (admin only)
│   │   ├── AccessSheet.jsx         # access sheet dump/download/upload
│   │   ├── Login.jsx               # auth UI
│   │   ├── ProtectedRoute.jsx      # auth + role guard
│   │   ├── Navigation.jsx          # sidebar nav
│   │   ├── SurveyList.jsx
│   │   ├── SurveyForm.jsx
│   │   ├── QuestionList.jsx
│   │   ├── QuestionForm.jsx
│   │   ├── DesignationMapping.jsx
│   │   ├── ImportSurvey.jsx        # two-phase Excel/CSV import
│   │   ├── DumpsheetValidator.jsx  # read-only validation ("/validator")
│   │   ├── DuplicateSurveyModal.jsx
│   │   ├── ErrorBoundary.jsx
│   │   ├── WaterAnimation.jsx      # upload spinner alternative
│   │   ├── Toast.jsx               # toast provider + hook
│   │   └── TranslationPanel.jsx
│   ├── contexts/AuthContext.jsx
│   ├── hooks/useValidation.js
│   ├── schemas/
│   │   ├── questionTypeSchema.js   # field visibility per type
│   │   ├── languageMappings.js     # ISO ↔ native script mappings
│   │   └── validationConstants.js  # patterns + length caps + enums
│   ├── services/api.js             # all Axios wrappers
│   ├── App.jsx                     # routes + layout shell
│   ├── App.css                     # all styles
│   ├── swiftchatRedesign.css       # imported alongside App.css
│   └── index.jsx                   # React 18 root
├── package.json                    # CRA app, "proxy": "http://localhost:5001"
├── vercel.json                     # /api/* rewrite + SPA fallback
└── README.md                       # this file
```

---

## Routing

Defined in `src/App.jsx`. All routes except `/login` are wrapped in `ProtectedRoute`; state-only routes are wrapped further in `<StateOnlyRoute>` (admins are bounced to `/admin`).

| Path | Component | Role |
|---|---|---|
| `/login` | `Login` | public |
| `/` | `SurveyList` | state |
| `/surveys/new` | `SurveyForm` | state |
| `/surveys/:surveyId/edit` | `SurveyForm` | state |
| `/surveys/:surveyId/questions` | `QuestionList` | state |
| `/surveys/:surveyId/questions/new` | `QuestionForm` | state |
| `/surveys/:surveyId/questions/:questionId/edit` | `QuestionForm` | state |
| `/surveys/:surveyId/preview` | `SurveyPreview` | state |
| `/import` | `ImportSurvey` | state |
| `/validator` | `DumpsheetValidator` | state |
| `/designations` | `DesignationMapping` | state |
| `/access-sheet` | `AccessSheet` | state |
| `/admin` | `AdminPanel` | admin |

---

## Application Logic

### Survey list & locking
- `SurveyList` displays surveys; "duplicate" opens `DuplicateSurveyModal`.
- Opening `QuestionList` calls `lockAPI.acquire(surveyId)`; the lock is released via `lockAPI.release` on unmount. A `409` response is interpreted as "another user holds the lock" and a banner is rendered.

### Question form
- `QuestionForm.jsx` derives the parent question from either the explicit `sourceQuestion` field or the implicit dot-prefix of `questionId`.
- For Multiple Choice Single Select questions, focusing any `OptionXChildren` input auto-fills the parent prefix (e.g. `Q2.1.`). Each comma typed at the end re-injects the prefix; trimming is performed at submit time.
- The mandatory dropdown is disabled and force-set to `No` whenever the parent question is not mandatory; the API enforces the same rule on `PUT`.

### Duplicate question
- The FE surface (`questionAPI.duplicate`) expects the BE to clone the entire subtree of the source question. The toast message reports the count of cloned descendants, e.g. `Question duplicated as Q3 (and 2 child questions)`.

### Import flow (`ImportSurvey.jsx`)
1. Pick file → click **Preview File** → calls `POST /api/import/preview` (5-minute timeout).
2. The response includes `surveys`, `questions`, `validationErrors`. Each survey row gets a checkbox; rows with errors get a red badge with the count.
3. The errors table filters live by selection plus a per-column `Search…` filter. The **Download CSV** button exports `<filename>-validation-errors.csv` with columns *Survey ID, Type, Row, ID, Errors*.
4. **Import Selected** posts the same file again to `POST /api/import?surveyIds=…&overwrite=…` to commit only the chosen surveys. The button is disabled if any selected survey still has errors locally.

### Validator flow (`DumpsheetValidator.jsx`)
- Posts to `POST /api/import/validate-dump`. The endpoint returns errors only for rows whose `Mode` is `Correction` or `New Data`.
- Provides the same per-column filter UI plus a global **Clear** button and a **Re-upload & Validate** label change once a report is on screen.

### Survey preview onboarding
- See [Key Features → Survey preview](#key-features) above.
- All five preview phases live inside `SurveyPreview.jsx` as a single state machine (`phase`).
- Dummy users live in a constant table at the top of the file.

---

## API Surface Used

All wrappers live in `src/services/api.js` and are grouped by domain.

| Group | Methods | Endpoints |
|---|---|---|
| `authAPI` | `login`, `warmup` | `POST /auth/login`, `GET /health` |
| `adminAPI` | `getUsers`, `createUser`, `updateUser` | `/admin/users` |
| `stateConfigAPI` | `getAll`, `upsert`, `update`, `delete` | `/admin/state-config` |
| `lockAPI` | `acquire`, `release`, `status` | `/surveys/:id/lock` |
| `publishAPI` | `publish`, `unpublish` | `/surveys/:id/publish`, `/surveys/:id/unpublish` |
| `surveyAPI` | `getAll`, `getById`, `create`, `update`, `delete`, `duplicate` | `/surveys`, `/surveys/:id`, `/surveys/:id/duplicate` |
| `questionAPI` | `getAll`, `create`, `update`, `delete`, `duplicate` | `/surveys/:id/questions[…]` |
| `exportAPI` | `download` | `GET /export/:surveyId` (blob) |
| `designationAPI` | CRUD + `seedDefaults`, `exportXlsx` | `/designations` |
| `accessSheetAPI` | `dump`, `getLatest`, `download` | `/access-sheet/*` |
| `validationAPI` | `validateUpload`, `getSchema` | `/validate-upload`, `/validation-schema` |
| `translateAPI` (Inferred) | `translate` | `POST /translate` |

Direct Axios calls (not wrapped in `api.js`):

- `POST /api/import/preview` — previewing the upload.
- `POST /api/import?...` — committing the upload.
- `POST /api/import/validate-dump` — validator screen.

All three pass `timeout: 5 * 60 * 1000` to override the global 30-second default.

### Auth conventions

- `Authorization: Bearer <token>` is added by an Axios request interceptor.
- 401 responses (except on `/auth/login`) clear the token and redirect to `/login`.

---

## Validation Rules (Frontend mirror)

`src/schemas/validationConstants.js` keeps the FE in lockstep with the backend validation engine. Highlights:

- `SURVEY_ID` pattern: `^[A-Za-z0-9_]+$`
- `QUESTION_ID` pattern: `^Q\d+(\.\d+)*$`
- `DATE_FORMAT`: `DD/MM/YYYY` or `DD/MM/YYYY HH:MM:SS`
- `TABLE_QUESTION_FORMAT`: `^[A-Za-z]:.*(\n[A-Za-z]:.*)*$` (literal `\n` is treated as a real newline)
- `AVAILABLE_MEDIUMS`: 10 languages — English, Hindi, Gujarati, Marathi, Tamil, Telugu, Bengali, Bodo, Punjabi, Assamese.
- `QUESTION_TYPES`: 12 types (see [Key Features](#key-features)).
- `MODES`: `New Data`, `Correction`, `Delete Data`, `None`.
- `YES_NO_VALUES`: `Yes`, `No`.
- Constraints: survey name ≤ 99 chars, description ≤ 256, question description ≤ 1024, options ≤ 20 (each ≤ 100 chars), hierarchy level 1–100.

`src/hooks/useValidation.js` exposes `{ errors, validateSurvey, validateQuestion, clearErrors, setErrors }` for inline form errors. The same rules are enforced server-side as a defence-in-depth.

---

## Environment Variables

The FE does **not** require any environment variables for local development.

| Variable | Purpose | Where used |
|---|---|---|
| `REACT_APP_FEATURE_PUBLISH` | Show/hide Publish & Unpublish buttons in `QuestionList`. (Inferred — also accepts a runtime `window.__ENV__.FEATURE_PUBLISH`.) | `src/components/QuestionList.jsx` |

The backend URL is decided at build/runtime by:

- **Local**: the `proxy` field in `package.json` (`http://localhost:5001`).
- **Production**: the rewrite in `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://survey-builder-be.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Edit the destination in `vercel.json` to point at a different backend.

---

## Installation

### Prerequisites
- Node.js 18+ (16 minimum)
- npm 8+
- A running backend at `http://localhost:5001` for local dev — see [`../Survey-builder-BE`](../Survey-builder-BE).

### Setup

```bash
cd Survey-builder-FE
npm install
```

---

## Running the Project

```bash
# Dev — http://localhost:3000, /api proxied to :5001
npm start

# Production build → ./build
npm run build

# Test runner (no tests committed yet)
npm test

# Eject from CRA (irreversible — avoid)
npm run eject
```

---

## Testing

No tests are committed. CRA bundles Jest + React Testing Library and is ready to use.

- Place tests beside the source: `SurveyForm.test.jsx` next to `SurveyForm.jsx`.
- Run with `npm test`.
- For hooks, use `renderHook` from `@testing-library/react`.

---

## Deployment

The app is deployed on **Vercel**.

- `vercel.json` controls SPA fallback and `/api/*` rewrites.
- Build command: `npm run build` (CRA default).
- Output directory: `build`.
- To switch backends, edit the `destination` in `vercel.json` and redeploy.

For self-hosted deployments, serve the `build/` directory behind a reverse proxy that forwards `/api/*` to the backend.

---

## Security & Permissions

- JWT stored in `localStorage` under the key `token`.
- Tokens are expected to expire (`exp` claim) — `AuthContext` refuses expired tokens on load.
- The Axios response interceptor clears the token and redirects to `/login` on any 401 except the login call itself.
- Inactive state users (`is_active=false`) are forced into a read-only mode in `SurveyList`, `QuestionList`, etc.
- Admins are blocked from state-only routes via `<StateOnlyRoute>` (auto-redirect to `/admin`).

---

## Error Handling & Logging

- Most components wrap API calls in `try/catch` and surface failures via `useToast()`.
- Validation errors are surfaced inline next to the offending field plus a top banner listing every error.
- A top-level `<ErrorBoundary />` catches runtime React errors.
- File uploads have a 5-minute Axios timeout to survive cold starts of the backend.
- No frontend monitoring/APM is configured.

---

## Known Constraints

- **No tests committed.**
- **No TypeScript** — `JSX` only.
- **Single CSS monolith** (`App.css`) — no CSS modules / styled-components.
- **`Voice Response`** appears in the question-type enum but no preview renderer exists for it yet (Inferred).
- **Token expiry** depends on the JWT having an `exp` claim. Dev tokens that omit `exp` are treated as never expiring.
- **CRA proxy quirks** — only used by `npm start`. If you swap to a custom dev server, configure the proxy explicitly.

---

## Future Improvements

- Add tests (component + hook + integration).
- Migrate to TypeScript.
- Break `App.css` into per-feature stylesheets or move to CSS modules.
- Add a renderer for `Voice Response`.
- Centralise the `lockAPI` lifecycle in a custom hook (`useSurveyLock`).
- Replace `localStorage` token storage with HttpOnly cookies once the backend issues them.
- Document the `translateAPI` wrapper inside `api.js` (currently used in components but not enumerated above).

---

## Contribution Guidelines

> No `CONTRIBUTING.md` is committed; this section is inferred from the project conventions.

### Branching
- Features: `feature/<short-description>`
- Fixes: `fix/<short-description>`

### Commits
- Imperative present tense (`Add survey preview onboarding`, not `Added…`).
- Don't amend previously pushed commits.
- Don't commit `.env*` or `build/`.

### When adding a feature

| Change | Update |
|---|---|
| New question type | `src/schemas/questionTypeSchema.js` + a new renderer in `src/components/preview/` |
| New API call | Add it to the appropriate group in `src/services/api.js` |
| New top-level route | `src/App.jsx` (lazy-load + `<Suspense>`) and update role gating in `ProtectedRoute.jsx` if needed |
| New env var | Update this README's table |

### Code style

- Functional components only; no class components.
- Hooks at the top of the function; handlers in the middle; JSX last.
- Prefer no-comments-by-default — favour self-documenting names.
- Match `kebab-case` for new CSS classes.

---

## Quick Reference

```bash
# Dev server
npm start

# Production build
npm run build

# Lint (CRA built-in via `react-scripts`)
npx react-scripts lint  # not configured to fail builds

# Switch production backend
# → edit vercel.json `rewrites[0].destination`
```
