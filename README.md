# Survey Builder Frontend (`fmb-survey-builder-client`)

React 18 SPA (Create React App) for authoring, previewing, importing/exporting multi-language surveys. Talks to [`Survey-builder-BE`](../Survey-builder-BE) over `/api/*` — dev via CRA `proxy`, prod via Vercel `rewrites`.

> Project-wide overview: [root README](../README.md).

---

## 1. Stack

| Concern | Library | Version | Notes |
|---|---|---|---|
| Framework | `react` / `react-dom` | 18.2 | No TypeScript. JSX only. |
| Routing | `react-router-dom` | 6 | Lazy-loaded routes + `<Suspense>` fallback |
| Server state | `@tanstack/react-query` | 5 | `staleTime: 2 min`, retry only on 5xx/408/429, `refetchOnWindowFocus: true` |
| HTTP | `axios` | 1.6 | Request interceptor attaches Bearer JWT; response interceptor handles 401 |
| UI base | `bootstrap` | 5.3 | + `App.css` (~59 KB monolith) + `swiftchatRedesign.css` |
| Date input | `react-datepicker` | 4.24 | |
| Build | `react-scripts` | 5.0.1 (CRA) | Eject not recommended |
| Tests | Jest + React Testing Library | (via CRA) | **No tests written yet** |

---

## 2. Feature → Limit Map

| # | Feature | Where | Limit / Caveat |
|---|---|---|---|
| 1 | **JWT login** | `Login.jsx`, `AuthContext.jsx` | Token in `localStorage` (XSS-readable). Logout = clear key + redirect. |
| 2 | **Protected routes** | `ProtectedRoute.jsx` + `StateOnlyRoute` in `App.jsx` | Admin auto-redirected to `/admin`; state users blocked from `/admin`. |
| 3 | **Survey CRUD** | `SurveyList.jsx`, `SurveyForm.jsx` | Active state users only. Inactive = read-only. |
| 4 | **Survey duplicate** | `DuplicateSurveyModal.jsx` | Server-side subtree clone. |
| 5 | **Question CRUD** | `QuestionList.jsx`, `QuestionForm.jsx` | 12 types; field visibility driven by `schemas/questionTypeSchema.js`. |
| 6 | **Multi-language editor** | `QuestionForm.jsx` | English entered once; other langs in "Translations" section. Auto-translate via `/api/translate`. Bodo = manual only (no ISO). |
| 7 | **Survey preview** | `components/preview/SurveyPreview.jsx` + 12 renderers | Onboarding mock (User ID → Verify → Language → UDISE). Mandatory checks enforced. Preview answers are **not persisted**. |
| 8 | **Excel/CSV import (preview)** | `ImportSurvey.jsx` | Two-phase: parse → pick surveys → commit. Errors include cell refs (`[Question Master B5]`). |
| 9 | **Dumpsheet Validator** | `DumpsheetValidator.jsx` (`/validator`) | Read-only. Errors filtered to `Mode∈{New Data,Correction}`. Downloadable CSV report. |
| 10 | **Excel export** | `surveyAPI`/`exportAPI` in `api.js` | Blob download (`URL.createObjectURL` + `revokeObjectURL`). |
| 11 | **Designation hierarchy** | `DesignationMapping.jsx` | Admin-managed list; XLSX export. |
| 12 | **Access Sheet dump/download** | `AccessSheet.jsx` | Per-state. Downloads latest XLSX. |
| 13 | **Admin panel** | `AdminPanel.jsx` (`/admin`, admin only) | User + state-config management. |
| 14 | **Toast notifications** | `Toast.jsx` (`useToast()`) | Auto-dismiss: 3.5 s (success/info/warning), 5 s (error). |
| 15 | **Inline validation** | `hooks/useValidation.js` + `schemas/validationConstants.js` | Mirrors BE rules; final authority is server. |
| 16 | **Concurrency lock** | `lockAPI` in `api.js` | UI surfaces `409` with lock-owner info. No real-time updates. |
| 17 | **Publish / Unpublish UI** | `QuestionList.jsx` | Gated by `REACT_APP_FEATURE_PUBLISH` (Inferred). |
| 18 | **Custom cursor** | `App.jsx` (`CustomCursor`) | Disabled on touch / `prefers-reduced-motion`. |
| 19 | **Error boundary** | `ErrorBoundary.jsx` | Wraps the route tree. |
| 20 | **5-min upload timeout** | `api.js` | Bumped from default 30 s to survive Vercel BE cold starts on large imports. |

---

## 3. File Tree

```
Survey-builder-FE/
├── public/                           # CRA static assets (index.html, favicon, fish.svg used by water animation)
├── package.json                      # "proxy": "http://localhost:5001"
├── vercel.json                       # /api/* → BE host; /(.*) → /index.html (SPA fallback)
└── src/
    ├── index.jsx                     # React 18 root.render()
    ├── App.jsx                       # Router + Suspense + QueryClient + AuthProvider + ToastProvider + CustomCursor + ErrorBoundary
    ├── App.css                       # Bootstrap + all custom styles (~59 KB monolith)
    ├── swiftchatRedesign.css         # Visual refresh overlay
    │
    ├── components/
    │   ├── preview/                  # Survey preview rendering
    │   │   ├── SurveyPreview.jsx     # Onboarding (User ID → Verify → Lang → UDISE) + per-question nav
    │   │   ├── QuestionRenderer.jsx  # Dispatch to type-specific renderer
    │   │   ├── PreviewNavigation.jsx # Next/Prev + progress
    │   │   ├── CalendarRenderer.jsx
    │   │   ├── DropDownRenderer.jsx
    │   │   ├── LikertScaleRenderer.jsx
    │   │   ├── MediaUploadRenderer.jsx
    │   │   ├── MultipleChoiceSingleRenderer.jsx
    │   │   ├── MultipleChoiceMultiRenderer.jsx
    │   │   ├── TextResponseRenderer.jsx
    │   │   ├── TabularTextInputRenderer.jsx
    │   │   ├── TabularDropDownRenderer.jsx
    │   │   └── TabularCheckBoxRenderer.jsx
    │   ├── AccessSheet.jsx           # Per-state XLSX dump + download
    │   ├── AdminPanel.jsx            # Admin-only: user + state-config CRUD
    │   ├── DesignationMapping.jsx    # Designation hierarchy CRUD + seed defaults
    │   ├── DumpsheetValidator.jsx    # /validator — read-only data validator
    │   ├── DuplicateSurveyModal.jsx  # Survey clone UI (server-side)
    │   ├── ErrorBoundary.jsx         # Top-level boundary; logs to console
    │   ├── ImportSurvey.jsx          # /import — XLSX/CSV preview-then-commit
    │   ├── Login.jsx                 # /login — POST /api/auth/login
    │   ├── Navigation.jsx            # App-shell nav bar
    │   ├── ProtectedRoute.jsx        # Token check + role enforcement
    │   ├── QuestionForm.jsx          # Create/edit question + multi-lang translations + auto-translate
    │   ├── QuestionList.jsx          # List + export + publish/unpublish + duplicate
    │   ├── SurveyForm.jsx            # Create/edit survey metadata
    │   ├── SurveyList.jsx            # State user home; CRUD actions
    │   ├── Toast.jsx                 # ToastProvider + useToast()
    │   └── WaterAnimation.jsx        # Decorative animation (fish.svg)
    │
    ├── contexts/
    │   └── AuthContext.jsx           # JWT decode, user object, login/logout helpers
    │
    ├── hooks/
    │   └── useValidation.js          # Client mirror of validation rules
    │
    ├── schemas/
    │   ├── languageMappings.js       # Language ↔ ISO ↔ native script (10 langs)
    │   ├── questionTypeSchema.js     # Field-visibility flags per Q-type
    │   └── validationConstants.js    # Regex + constants
    │
    └── services/
        └── api.js                    # Axios instance + 13 grouped API objects (auth/admin/survey/...)
```

---

## 4. Route Map (`src/App.jsx`)

All routes except `/login` require auth (`<ProtectedRoute>`). All non-admin routes use `<StateOnlyRoute>` which **auto-redirects admins to `/admin`**.

| Path | Component | Access |
|---|---|---|
| `/login` | `Login` | Public |
| `/` | `SurveyList` | State (active or inactive read-only) |
| `/surveys/new` | `SurveyForm` | State + active |
| `/surveys/:surveyId/edit` | `SurveyForm` | State + active |
| `/surveys/:surveyId/questions` | `QuestionList` | State |
| `/surveys/:surveyId/questions/new` | `QuestionForm` | State + active |
| `/surveys/:surveyId/questions/:questionId/edit` | `QuestionForm` | State + active |
| `/surveys/:surveyId/preview` | `SurveyPreview` | State |
| `/import` | `ImportSurvey` | State + active |
| `/validator` | `DumpsheetValidator` | State |
| `/designations` | `DesignationMapping` | State (admin can manage; read-only otherwise) |
| `/access-sheet` | `AccessSheet` | State |
| `/admin` | `AdminPanel` | **Admin only** |

---

## 5. API Client Map (`src/services/api.js`)

13 grouped exports — single Axios instance with auth interceptors.

| Object | Endpoints covered |
|---|---|
| `authAPI` | `POST /auth/login` |
| `adminAPI` | `GET/POST/PATCH /admin/users` |
| `stateConfigAPI` | `GET/POST/PATCH/DELETE /admin/state-config[/:state_code]` |
| `lockAPI` | `POST/DELETE/GET /surveys/:id/lock` |
| `publishAPI` | `POST /surveys/:id/publish`, `…/unpublish` |
| `surveyAPI` | Surveys CRUD + `/duplicate` |
| `questionAPI` | Questions CRUD + `/duplicate` |
| `exportAPI` | `GET /export/:surveyId` (blob download) |
| `designationAPI` | CRUD + `/seed-defaults` + `/export` |
| `accessSheetAPI` | `/dump`, `/latest`, `/latest/download` |
| `translateAPI` | `POST /translate` |
| `validationAPI` | `POST /validate-upload`, `GET /validation-schema` |

### Interceptors

- **Request:** attaches `Authorization: Bearer <localStorage.token>` to every call.
- **Response:** on `401`, clears `localStorage.token` and redirects to `/login`.

### Blob download pattern (`exportAPI`, `accessSheetAPI`, `designationAPI.exportXlsx`)

```js
const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
const url = URL.createObjectURL(blob);
const a = Object.assign(document.createElement('a'), { href: url, download: filename });
a.click();
URL.revokeObjectURL(url);    // always revoke
```

---

## 6. Auth & RBAC

- **JWT** issued by `POST /api/auth/login`. Stored under `localStorage.token`.
- `AuthContext.jsx` decodes the payload → `{ id, username, role, stateCode, isActive }`.
- `ProtectedRoute` checks for a valid token; missing/expired → `/login`.
- Admin home is `/admin`; state-user home is `/`. `<StateOnlyRoute>` redirects admins away from state-user routes.

### Role behaviour matrix

| Action | admin | state (active) | state (inactive) |
|---|---|---|---|
| `/` survey list | redirected → `/admin` | ✓ | ✓ (read-only) |
| Create/edit/delete survey | — (server-side too) | ✓ | — |
| Create/edit/delete question | — | ✓ | — |
| Preview | — | ✓ | ✓ |
| Import | — | ✓ | — |
| Designations CRUD | ✓ | ✓ (when active) | — |
| Access Sheet | ✓ | ✓ | ✓ (download) |
| Admin panel `/admin` | ✓ | blocked | blocked |

---

## 7. State Management

| Concern | Mechanism |
|---|---|
| User session | `AuthContext` (`useAuth()`) |
| Toast queue | `ToastContext` inside `Toast.jsx` (`useToast()`) |
| Server data | `@tanstack/react-query` — `staleTime: 2 min`, retry on 5xx/408/429 |
| Local form state | `useState` per component |
| **Not used** | Redux, Zustand, MobX, Recoil |

---

## 8. Validation (Client Mirror)

`hooks/useValidation.js` mirrors backend rules to give inline form errors. Patterns live in `schemas/validationConstants.js`.

- **Survey ID:** `^[A-Za-z0-9_]+$`
- **Question ID:** `^Q\d+(\.\d+)*$`
- **Survey name:** ≤ 99 chars
- **Description:** ≤ 256 chars
- **Question description:** ≤ 1024 chars
- **Options:** 2–20 per question, each ≤ 100 chars
- **Tabular header:** exactly 2 comma-separated tokens
- **Tabular body:** optional `^[A-Za-z]:.*(\n[A-Za-z]:.*)*$`

> **Server is the final authority.** Client validation only catches obvious issues early.

---

## 9. Question Types (`schemas/questionTypeSchema.js`)

12 types with per-type field visibility:

```
Multiple Choice Single Select   (MCSS — drives branching via OptionXChildren)
Multiple Choice Multi Select
Text Response
Tabular Text Input
Tabular Drop Down
Tabular Check Box
Likert Scale
Calendar
Media Upload
Drop Down
Voice Response                  (Inferred: no renderer in preview/)
```

Visibility flags: `showOptions`, `showTableFields`, `showTextInputType`, `showMediaType`, …

**Translations object** (per question):

```jsonc
{
  "questionDescription": "English text",
  "translations": {
    "English": { "questionDescription": "...", "options": [{ text, textInEnglish, children }] },
    "Hindi":   { "questionDescription": "...", "options": [...] }
  }
}
```

English content entered once; other languages either typed manually or auto-translated via `/api/translate`.

---

## 10. Local Setup

```bash
cd Survey-builder-FE
npm install
npm start                # CRA dev on :3000, proxies /api → :5001
```

Backend must run on `:5001` (or update `"proxy"` in `package.json`).

### Scripts

```bash
npm start                # dev server
npm run build            # production build → ./build
npm test                 # Jest (no tests yet)
npm run eject            # CRA eject — avoid
```

### Production (Vercel)

[`vercel.json`](./vercel.json):

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://survey-builder-be.onrender.com/api/:path*" },
    { "source": "/(.*)",       "destination": "/index.html" }
  ]
}
```

Change `destination` of `/api/:path*` to point at a different backend.

---

## 11. Conventions

- **Files:** PascalCase `.jsx` for components, camelCase `.js` for hooks/services/schemas.
- **Hooks:** functional components only; hooks at top, handlers next, JSX last.
- **API errors:** `err.response?.data?.message` → toast (`useToast()`); fall back to a generic.
- **CSS:** prefer Bootstrap utilities; add to `App.css` only when utilities don't suffice. No CSS-in-JS.
- **Routes:** always wrap new top-level routes in `React.lazy()` + `<Suspense>`.
- **API additions:** add new methods to the relevant export object in `services/api.js`; create a new export object for a new domain.
- **No comments by default** — names should self-document.

---

## 12. Limits & Known Constraints

- **No tests.** Jest + RTL wired via CRA; nothing written.
- **JWT in `localStorage`** — XSS-readable. No refresh tokens; manual re-login on 24 h expiry.
- **Auth `exp` claim** — `AuthContext` checks expiry on decode; tokens without `exp` never expire.
- **CRA only** — no Vite migration. `npm run build` is slow on large workspaces.
- **`App.css` is a 59 KB monolith** — hard to split, but tree-shakes via Bootstrap purge.
- **5-min Axios timeout on uploads** — works around Vercel BE cold starts; can mask hung uploads from users.
- **Voice Response** — Q-type in the enum but no renderer in `preview/`.
- **Custom cursor** — adds global listeners; disabled on touch / reduced-motion only.
- **No CSP** configured in `index.html`.
- **`proxy` doesn't apply to `npm run build`** — only `npm start`. Prod uses `vercel.json` rewrites.

---

## 13. Common Pitfalls

1. **Redirect loop to `/login`** — token expired or invalid `exp` claim. Clear with `localStorage.removeItem('token')`.
2. **API 404 in dev** — backend not on `:5001`, or `proxy` in `package.json` outdated.
3. **CORS errors in dev** — only happens if you disable the CRA proxy. Backend's `cors()` is permissive by default.
4. **Admin sees `/` instead of survey list** — by design (`StateOnlyRoute` redirects admins to `/admin`).
5. **Lazy route flash** — `<Suspense>` shows the "Loading…" `PageLoader`. Don't block render in route components on top-level effects.
6. **Blob download leaks memory** — always call `URL.revokeObjectURL(url)` after the anchor click.

---

## 14. Future Improvements

- Move JWT from `localStorage` to `httpOnly` cookie + add refresh-token flow.
- Add tests (RTL for components, MSW for API mocking).
- Split `App.css` by route or move to CSS Modules.
- Replace CRA with Vite for faster builds + HMR.
- Extract validation rules into a shared package with BE (single source of truth).
- Add a service-worker / offline cache for surveys + designations.
- Wire up Sentry or PostHog for client error reporting.

---

## 15. Quick Reference

```bash
npm start                # dev (:3000, proxies /api → :5001)
npm run build            # production bundle → ./build

# Add a new API domain                  → edit src/services/api.js (new export)
# Add a new question type               → schemas/questionTypeSchema.js + new renderer in components/preview/
# Add a new route                       → src/App.jsx (React.lazy + <Route>); add to <StateOnlyRoute> or ProtectedRoute as needed
# Change prod backend                   → vercel.json rewrite destination
# Reset auth                            → localStorage.removeItem('token')
```
