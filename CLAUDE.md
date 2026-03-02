# CLAUDE.md — Survey Builder Frontend

Comprehensive guide for AI assistants working on this codebase. Read this before making any changes.

---

## Project Overview

**Survey Builder Frontend** is a React 18 SPA for administering surveys — create, edit, preview, import/export surveys and manage multi-language question banks. It is the frontend of the FMB Survey Builder system and communicates with a separate backend REST API.

**Core capabilities:**
- Survey lifecycle management (CRUD, duplicate, publish/unpublish)
- 12 question types with type-specific field visibility
- Multi-language support (10 languages: English, Hindi, Gujarati, Marathi, Tamil, Telugu, Bengali, Bodo, Punjabi, Assamese)
- Survey preview with question-by-question navigation
- Excel import/export
- Designation hierarchy CRUD
- Access sheet dump/download
- Admin panel (users + state configuration)
- Role-based access control (admin vs state users)
- Concurrency locking (lock/release API)

---

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | React 18.2.0 |
| Routing | React Router DOM v6 |
| HTTP Client | Axios 1.6.2 |
| UI Library | Bootstrap 5.3.8 |
| Date Input | react-datepicker 4.24.0 |
| Build Tool | react-scripts 5.0.1 (Create React App) |
| Language | JavaScript / JSX (no TypeScript) |
| Linting | ESLint (CRA defaults, `react-app` config) |
| Testing | Jest + React Testing Library (via CRA, no tests written yet) |

---

## Repository Structure

```
Survey-builder-FE/
├── public/
│   └── index.html              # SPA root with <div id="root">
├── src/
│   ├── components/
│   │   ├── preview/            # Survey preview renderers (one per question type)
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
│   │   ├── AdminPanel.jsx        # User and state config management (admin only)
│   │   ├── AccessSheet.jsx       # Access sheet dump and download
│   │   ├── Login.jsx             # Authentication UI
│   │   ├── ProtectedRoute.jsx    # Route guards + role enforcement
│   │   ├── Navigation.jsx        # App-shell nav bar
│   │   ├── SurveyList.jsx        # Survey listing + CRUD actions
│   │   ├── SurveyForm.jsx        # Create/edit survey form
│   │   ├── QuestionList.jsx      # Question listing
│   │   ├── QuestionForm.jsx      # Create/edit question form
│   │   ├── DesignationMapping.jsx # Designation hierarchy CRUD
│   │   ├── ImportSurvey.jsx      # File upload import handler
│   │   ├── DuplicateSurveyModal.jsx # Survey duplication modal
│   │   ├── Toast.jsx             # Toast notification system + context
│   │   └── TranslationPanel.jsx  # Multi-language input fields
│   ├── contexts/
│   │   └── AuthContext.jsx       # JWT state, login/logout, user object
│   ├── hooks/
│   │   └── useValidation.js      # Client-side form validation hook
│   ├── schemas/
│   │   ├── questionTypeSchema.js  # Field visibility config per question type
│   │   ├── languageMappings.js    # Language code ↔ label mappings
│   │   └── validationConstants.js # Shared constants and regex patterns
│   ├── services/
│   │   └── api.js                # Axios instance + all API wrappers (294 lines)
│   ├── App.jsx                   # Route definitions + Suspense shell
│   ├── App.css                   # All CSS (59 KB monolith — Bootstrap + custom)
│   └── index.jsx                 # React 18 root.render() bootstrap
├── vercel.json                   # Prod rewrites: /api/* → backend, SPA fallback
├── package.json                  # Scripts, deps, proxy config
└── README.md                     # Human-readable project documentation
```

---

## Development Workflow

### Prerequisites
- Node.js 16+ (18+ recommended)
- npm 8+
- Backend running at `http://localhost:5001` for local dev

### Commands

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:3000, proxies /api to :5001)
npm start

# Production build (output: /build)
npm run build

# Run tests (Jest + React Testing Library)
npm test
```

### API Proxying

In development, `/api` calls are proxied to `http://localhost:5001` via the `proxy` field in `package.json`. In production (Vercel), `vercel.json` rewrites `/api/:path*` to the backend host.

**Never hardcode backend URLs inside `src/`.** All API calls must use relative `/api` paths.

---

## Architecture & Key Patterns

### Authentication

- JWT tokens stored in `localStorage` under key `token`
- `AuthContext` (`src/contexts/AuthContext.jsx`) decodes the JWT payload on login and exposes: `{ id, username, role, stateCode, isActive }`
- `ProtectedRoute` checks for a valid token on every protected route; redirects to `/login` if missing/expired
- Axios request interceptor (in `src/services/api.js`) auto-attaches `Authorization: Bearer <token>` to every request
- Axios response interceptor clears token and redirects to `/login` on any 401

### Role-Based Access

| Role | Home | Survey/Question Routes | Admin Panel |
|---|---|---|---|
| `admin` | Redirect → `/admin` | Blocked | Full access |
| `state` (active) | `/` | Full CRUD | Blocked |
| `state` (inactive) | `/` | Read-only (no create/edit) | Blocked |

### State Management

- **No Redux or Zustand** — all state is React local state (`useState`) or shared via Context API
- `AuthContext` — user session
- `ToastContext` (inside `Toast.jsx`) — notification queue
- Components fetch data independently on mount via `useEffect` + API calls; no cross-component cache

### API Client (`src/services/api.js`)

All API interactions go through named export objects grouped by resource domain:

```js
authAPI          // login
adminAPI         // getUsers, createUser, updateUser
stateConfigAPI   // getAll, upsert, update, delete
lockAPI          // acquire, release, status
publishAPI       // publish, unpublish
surveyAPI        // getAll, getById, create, update, delete, duplicate
questionAPI      // getAll, create, update, delete, duplicate
exportAPI        // download (blob → file)
designationAPI   // CRUD, seedDefaults, exportXlsx
accessSheetAPI   // dump, getLatest, download
validationAPI    // validateUpload, getSchema
```

File downloads use the blob pattern: create temporary Blob URL → anchor click → `URL.revokeObjectURL`.

**When adding new API calls:** add them to the appropriate group object in `api.js`. If a new domain is needed, add a new named export following the existing pattern.

### Validation (`src/hooks/useValidation.js`)

Custom hook that returns `{ errors, validateSurvey, validateQuestion, clearErrors, setErrors }`.

- `validateSurvey(formData)` — validates survey ID (alphanumeric + underscore), name (max 99 chars), description (max 256), mediums enum, access levels, date formats/order, Yes/No fields, mode
- `validateQuestion(formData)` — validates question ID format (Q1, Q1.1, etc), description (max 1024), options count/content, table format
- Validation patterns are centralized in `src/schemas/validationConstants.js` — update constants there, not inline

### Question Types (`src/schemas/questionTypeSchema.js`)

Defines which form fields render for each of the 12 question types:

```
Multiple Choice (Single) | Multiple Choice (Multi) | Text Response
Tabular Text Input | Tabular Drop Down | Tabular Check Box
Likert Scale | Calendar | Media Upload | Drop Down
```

Field visibility flags include: `showOptions`, `showTableFields`, `showTextInputType`, `showMediaType`, etc.

**When adding a new question type**, update `questionTypeSchema.js` to define its field visibility, then add a renderer component under `src/components/preview/` for the preview UI.

### Routing (`src/App.jsx`)

All main page components are **lazy-loaded** via `React.lazy()` wrapped in a `<Suspense>` boundary. Always use lazy loading for new top-level route components.

Route map:
```
/login                                     → Login (public)
/                                          → SurveyList (state users; admin redirected)
/surveys/new                               → SurveyForm
/surveys/:surveyId/edit                    → SurveyForm
/surveys/:surveyId/questions               → QuestionList
/surveys/:surveyId/questions/new           → QuestionForm
/surveys/:surveyId/questions/:questionId/edit → QuestionForm
/surveys/:surveyId/preview                 → SurveyPreview
/import                                    → ImportSurvey
/designations                              → DesignationMapping
/access-sheet                              → AccessSheet
/admin                                     → AdminPanel (admin only)
```

### Toast Notifications

Use the `useToast()` hook from `src/components/Toast.jsx`:

```js
import { useToast } from './Toast';

const toast = useToast();
toast.success('Survey saved');
toast.error('Failed to load data');
toast.info('Processing...');
toast.warning('This will overwrite existing data');
```

Auto-dismiss: 3.5s for success/info/warning, 5s for error.

---

## Coding Conventions

### File & Naming

- **Components:** PascalCase `.jsx` (e.g., `SurveyForm.jsx`)
- **Hooks:** camelCase with `use` prefix `.js` (e.g., `useValidation.js`)
- **Services/schemas:** camelCase `.js` (e.g., `api.js`, `questionTypeSchema.js`)
- **CSS classes:** kebab-case (e.g., `survey-list-container`, `login-card`)

### Component Structure

- Functional components only (no class components)
- Hooks at the top; handlers below; JSX return at the bottom
- `useEffect` for data fetching on mount; always include relevant dependencies in the dependency array
- Error handling via try/catch with toast notifications for user feedback

### CSS

- All styles live in `src/App.css` — a 59 KB monolith
- Bootstrap 5 utility classes are preferred for layout and common styling
- Only add custom classes to `App.css` when Bootstrap utilities are insufficient
- No CSS modules, no styled-components, no CSS-in-JS

### API Error Handling

```js
try {
  const response = await surveyAPI.create(payload);
  toast.success('Survey created');
  navigate('/');
} catch (err) {
  toast.error(err.response?.data?.message || 'Failed to create survey');
}
```

Always check `err.response?.data?.message` before falling back to a generic message.

### No Comments by Default

Code should be self-documenting. Add comments only when logic is non-obvious (e.g., complex date comparison, blob download pattern).

---

## Environment & Deployment

### Local Development

No `.env` file is required. The proxy in `package.json` handles API routing:

```json
"proxy": "http://localhost:5001"
```

### Production (Vercel)

`vercel.json` rewrites handle both API proxying and SPA fallback:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://survey-builder-be.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

To change the backend URL in production, update the `destination` in `vercel.json`.

---

## Testing

No tests are currently written. The project has Jest + React Testing Library available via CRA.

- Test files should live alongside source files: `SurveyForm.test.jsx` next to `SurveyForm.jsx`
- Run tests with `npm test`
- For hooks: test with `@testing-library/react-hooks` or `renderHook` from RTL

---

## Common Pitfalls

1. **401 redirect loops** — If the backend returns 401 on the login endpoint itself, the Axios interceptor will redirect to `/login` again. Ensure the login endpoint does not return 401 for invalid credentials (use 400 or 403 instead).

2. **Proxy not working in dev** — The `proxy` field in `package.json` only applies to `npm start`. If using a custom dev server setup, configure the proxy manually.

3. **Admin vs state user routing** — Admins are blocked from `/`, survey, question, and designation routes; they are redirected to `/admin`. State users are blocked from `/admin`. This logic is enforced in both `ProtectedRoute.jsx` and individual components.

4. **Question ID format** — Question IDs must match the pattern `Q<n>` or `Q<n>.<n>` (e.g., `Q1`, `Q1.1`, `Q2.3`). The regex is in `validationConstants.js`.

5. **Blob downloads** — Always call `URL.revokeObjectURL(url)` after triggering a file download to avoid memory leaks.

6. **Lazy loading** — New route-level components must be wrapped in `React.lazy()` + `<Suspense>` in `App.jsx`.

7. **Token expiry** — `AuthContext` checks expiry on decode; a missing `exp` claim means the token never expires (dev tokens may omit it).

---

## Branch & Git Conventions

- Feature branches: `feature/<short-description>`
- Fix branches: `fix/<short-description>`
- Commit messages: imperative mood, present tense (`Add survey duplication modal`, not `Added...`)
- Do not commit `.env` files or `/build` output (both are in `.gitignore`)

---

## Quick Reference

```bash
# Dev server
npm start

# Production build
npm run build

# Run tests
npm test

# Add a new API domain
# → Edit src/services/api.js, add export object

# Add a new question type
# → Edit src/schemas/questionTypeSchema.js (field visibility)
# → Add renderer in src/components/preview/

# Add a new route
# → Edit src/App.jsx with React.lazy() + <Route>
# → Add role guard logic in ProtectedRoute.jsx if needed

# Change production backend URL
# → Edit vercel.json rewrite destination
```
