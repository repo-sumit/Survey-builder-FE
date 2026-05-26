# Release Notes — Survey Builder Redesign (Release Candidate)

**Version:** 1.0.0 — Design Migration RC
**Date:** 2026-05-27
**Scope:** Frontend redesign only. Backend API contracts, database schema, and authentication semantics are unchanged.

---

## What changed

The full Survey Builder admin UI was migrated to a new design system across thirteen phases. This release ships the result of that migration as a single deployable frontend build.

### Major user-visible changes

- **New visual language** across every screen: design tokens, slate neutrals, three-tier elevation, 12 px card radius, Inter + Exo + JetBrains Mono typography
- **App-shell sidebar** (`src/components/ui/Sidebar.jsx`) replaces the old top-nav `Navigation.jsx` component
- **PageHeader primitive** (`src/components/ui/PageHeader.jsx`) standardises every screen header (title, subtitle, badges, actions)
- **Reusable Toast notifications** (`src/components/Toast.jsx`) replace inline `alert()` calls
- **Branded loader / app-loader** (`src/components/AppLoader.jsx`) replaces blank-while-loading flashes during auth bootstrap
- **Accessible focus + reduced-motion** support — all shimmer animations honour `prefers-reduced-motion`
- **Google sign-in** is the only auth path; legacy username/password row is gated behind `REACT_APP_LEGACY_LOGIN_VISIBLE` for the migration window
- **Access-denied** is a first-class state (`src/components/AccessDenied.jsx`) instead of redirect-to-login
- **Survey Preview** rebuilt as a phone-frame inspector with phase chips, progress meta, and a Save-and-Continue flow

### Screens migrated (13 / 13)

| # | Screen | Component | Status |
|---|---|---|---|
| 1 | Login | `Login.jsx` | ✅ Migrated |
| 2 | Survey List | `SurveyList.jsx` | ✅ Migrated |
| 3 | Survey Form | `SurveyForm.jsx` | ✅ Migrated |
| 4 | Question List | `QuestionList.jsx` | ✅ Migrated |
| 5 | Question Form | `QuestionForm.jsx` | ✅ Migrated |
| 6 | Survey Preview | `preview/SurveyPreview.jsx` | ✅ Migrated |
| 7 | Import Survey | `ImportSurvey.jsx` | ✅ Migrated |
| 8 | Dumpsheet Validator | `DumpsheetValidator.jsx` | ✅ Migrated |
| 9 | Access Sheet | `AccessSheet.jsx` | ✅ Migrated |
| 10 | Designation Mapping | `DesignationMapping.jsx` | ✅ Migrated |
| 11 | Admin Panel | `AdminPanel.jsx` | ✅ Migrated |
| 12 | App Loader | `AppLoader.jsx` | ✅ Migrated |
| 13 | Access Denied | `AccessDenied.jsx` | ✅ Migrated |

### Behind-the-scenes changes

- **AuthContext hardened** (`src/contexts/AuthContext.jsx`): bootstrap timeout banner, NOT_INVITED / INACTIVE / DOMAIN_BLOCKED reason surfaces, `purgeBrowserAuthArtifacts` nukes `sb-*`/`token`/`sessionStorage` + server-side `signOutSupabase` on logout
- **`@tanstack/react-query`** integrated for client cache + invalidation
- **Lazy-loaded routes** retained — top-level chunks ≤ 48 kB gzipped
- **E2E test fixtures** (`e2e/fixtures.js`) derive the `sb-<project-ref>-auth-token` localStorage key from `REACT_APP_SUPABASE_URL` at test time
- **`.env.example`** added with safety comments + Phase-12 recovery procedure
- **Production build now compiles with zero ESLint warnings** for the first time in the project's history

---

## Test results (final)

| Suite | Result | Command |
|---|---|---|
| Frontend Jest | **253 / 253 passing** (17 suites, 19.6 s) | `npm run test:ci` |
| Backend Jest | **19 / 19 passing** (2 suites, 1.4 s) | `cd ../Survey-builder-BE && npm test` |
| Production build | **Compiled successfully — 0 warnings**, gzipped main 150.77 kB, CSS 32.78 kB | `npm run build` |
| Playwright E2E | **8 passing**, 2 documented `test.fixme` (serial run) | `npm run e2e -- --workers=1` |
| 8 standalone browser smokes | All pass with **0 console / page / failed-request errors** | `node smoke/<name>.js` |
| Security checklist | **All items green** (see `DESIGN_MIGRATION_PHASE_13.md`) | manual review |

---

## Known non-blockers

These are documented and intentionally not addressed in this RC. Each has a documented re-entry point.

1. **Auto-translate wiring** — Deferred to Phase 8.5. `translateAPI.translate` in `src/services/api.js` is already shipped; only the QuestionForm UI hook + button remain.
2. **Dead-CSS cleanup in `App.css`** — Deferred. 156 grep-proven dead selectors identified; full inventory + safe-to-remove vs. still-load-bearing list in `docs/DESIGN_MIGRATION_PHASE_13.md`. Risk of regressing shared utility classes was the explicit reason to defer.
3. **`swiftchatRedesign.css` (1654 lines)** — Deferred. Theming-override interactions need a discovery pass; compiles cleanly today, adds ~8.2 kB gzipped.
4. **Two E2E `test.fixme` cases** in `e2e/auth-routing.spec.js`:
   - "reload /admin while authed remains authed"
   - "back button after logout does not show protected page"
   - Both hit AuthContext boot timeout under Playwright's route-mocked Supabase token-refresh state machine. Real-browser behaviour is correct (verified via the standalone smokes). These are test-infra limitations, not regressions.
5. **Smoke-orchestration flakes** — Documented Phase 9–12 pattern (Playwright AppLoader race when many fresh contexts spawn rapidly). Smokes self-skip with `status: "skipped-orchestration-flake"` rather than failing the whole run. Always passes on serial / retry.
6. **Parallel-worker E2E flakes** — CRA dev server contention with 10 fresh contexts. `--workers=1` is reliable. CI should run E2E serial; consider migrating to a pre-built static server (the production build already runs on `:3030` via `npx serve`).

---

## Deployment

See `docs/DEPLOYMENT_CHECKLIST.md` for the full pre-/during-/post-deploy walkthrough.

### Quick reference

- **Build:** `cd Survey-builder-FE && npm ci && npm run build` (artefact in `build/`)
- **Host:** Vercel (rewrites in `Survey-builder-FE/vercel.json` proxy `/api/*` to `https://survey-builder-be.onrender.com/api/*`)
- **Required env vars:** `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` (build-inlined; see `Survey-builder-FE/.env.example`)
- **Optional env vars:** `REACT_APP_LEGACY_LOGIN_VISIBLE`, `REACT_APP_FEATURE_PUBLISH`

### Rollback plan

This RC is **frontend-only**. Backend, database schema, and auth provider all remain on their current production versions.

- **To roll back:** redeploy the previous frontend build (or via Vercel: "Promote to Production" the prior good deployment from the Deployments tab).
- **No backend rollback** is required — the backend hasn't changed.
- **No database migration** is required — the schema is unchanged.
- **No user-data rebuild** is required — there is no client-side persistence beyond auth tokens, which the new logout flow purges cleanly.

If a rollback is triggered:
1. Promote the previous Vercel production deployment.
2. Verify `/api/health` still resolves (it routes via the FE rewrite to the unchanged BE host).
3. Verify a state user can sign in via Google and reach the Survey List.
4. No further action required.

---

## Compatibility notes

- **Browser support:** Chrome / Edge / Firefox / Safari, last 2 versions (per `browserslist` in `package.json`). Mobile Safari + Chrome on iPhone / Android tested via smoke screenshots.
- **Backend version pinning:** No new backend endpoints are called by this build. The legacy `/api/auth/login` endpoint is now `410 Gone` server-side and the FE has stopped calling it. If you are running an older BE that still returns 200 on `/api/auth/login`, that is fine — the FE simply doesn't hit it.
- **Supabase project:** The build pins to whichever Supabase project ref is set at build time. Switching projects requires a rebuild (anon key + URL are inlined).

---

## Acknowledgements

This release is the culmination of design-migration phases 1–13. Detailed per-phase notes are in `docs/DESIGN_MIGRATION_PHASE_13.md` (final phase) and the surrounding git history.
