# Deployment Checklist — Survey Builder Redesign (Release Candidate)

This document is the operator's runbook for promoting the design-migration RC to production. Pair it with `docs/RELEASE_NOTES.md` (what changed) and `docs/DESIGN_MIGRATION_PHASE_13.md` (the full release-readiness report including security checklist evidence).

---

## 0. Scope

- **What deploys:** `Survey-builder-FE` frontend only.
- **What does NOT deploy:** `Survey-builder-BE` (unchanged), the PostgreSQL database (unchanged), Supabase auth provider (unchanged).
- **Hosting target:** Vercel (existing project). The build artefact is the contents of `Survey-builder-FE/build/` produced by `npm run build`.

---

## 1. Pre-deploy

### 1.1 Confirm the commit / tag

- [ ] The RC commit is on `main` (or the branch you intend to deploy from).
- [ ] `git status` in `Survey-builder-FE/` is clean (no uncommitted RC content). Run from inside `Survey-builder-FE/`:
      `git status -s` → expect empty output.
- [ ] (Optional but recommended) Tag the RC: `git tag -a v1.0.0-rc1 -m "Design migration RC1"` then `git push origin v1.0.0-rc1`.

### 1.2 Environment variables

This build reads its environment from a local `.env` (CRA inlines `REACT_APP_*` values at build time). The same applies to whichever build environment Vercel uses.

#### Frontend env keys (required at BUILD time)

| Key | Required | Source | Notes |
|---|---|---|---|
| `REACT_APP_SUPABASE_URL` | ✅ | Supabase dashboard → Settings → API | Also drives the `sb-<project-ref>-auth-token` localStorage key |
| `REACT_APP_SUPABASE_ANON_KEY` | ✅ | Supabase dashboard → Settings → API → "anon public" | **Public.** Anon JWT meant for clients. Service-role key MUST NOT go here |
| `REACT_APP_LEGACY_LOGIN_VISIBLE` | optional | — | `true` to surface legacy username/password row during the Google-auth migration window |
| `REACT_APP_FEATURE_PUBLISH` | optional | — | `true` to enable Publish/Unpublish controls on QuestionList |

- [ ] Vercel project env variables are set for **all three of: Production, Preview, Development**.
- [ ] `REACT_APP_SUPABASE_ANON_KEY` is the anon key, not the service-role key. (Service-role JWTs decode to `role: "service_role"`; anon JWTs decode to `role: "anon"`. If unsure, paste the JWT into jwt.io.)
- [ ] **Do NOT commit `.env`.** It is in `.gitignore`. Use `.env.example` as the template; copy locally to `.env`.

#### Backend env keys (already deployed, listed for reference only)

The backend at `https://survey-builder-be.onrender.com` is unchanged in this release. Its env reference (from `Survey-builder-BE/CLAUDE.md`) is:

| Key | Required | Default |
|---|---|---|
| `DATABASE_URL` | ✅ | — |
| `JWT_SECRET` | ✅ | — |
| `PORT` | — | 5000 |
| `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD` | — | admin / admin123 (do NOT use defaults in production) |
| `FEATURE_PUBLISH` | — | false |
| `NODE_ENV` | — | development |
| `DB_SSL` | — | auto-detected |
| `TRANSLATE_API_URL` / `TRANSLATE_API_KEY` / `TRANSLATE_TIMEOUT_MS` | — | LibreTranslate defaults |

- [ ] No backend env changes required for this release.

### 1.3 Final local verification (do this on the build machine, NOT in CI)

Run from `Survey-builder-FE/`:

```bash
# 1. Fresh install
npm ci

# 2. FE unit + component tests
npm run test:ci          # expects 253 / 253 passing across 17 suites

# 3. Production build (must compile with zero warnings)
npm run build            # expects "Compiled successfully." with no warnings

# 4. E2E (serial — see Known Non-Blockers in RELEASE_NOTES.md)
npm run e2e -- --workers=1   # expects 8 passing, 2 documented test.fixme skips

# 5. (optional) Backend Jest — for parity check
cd ../Survey-builder-BE && npm ci && npm test
#                          ↑ expects 19 / 19 passing across 2 suites
```

Optionally exercise the production build with browser smokes (slowest but most thorough):

```bash
# In one terminal: serve the FE build on :3030
cd Survey-builder-FE
npx serve -s build -l 3030

# In another terminal: run the smokes
node smoke/surveyform-smoke.js          # default BASE_URL=http://localhost:3000
node smoke/questionlist-smoke.js
node smoke/questionform-smoke.js
node smoke/surveypreview-smoke.js        # default BASE_URL=http://localhost:3030
node smoke/import-validator-smoke.js     # default BASE_URL=http://localhost:3030
node smoke/config-screens-smoke.js       # default BASE_URL=http://localhost:3030
node smoke/adminpanel-smoke.js           # default BASE_URL=http://localhost:3030
node smoke/core-journey-smoke.js         # default BASE_URL=http://localhost:3030
```

Each smoke writes a `smoke/screenshots/<name>-report.json`. Expect `consoleErrorsTotal: 0`, `pageErrorsTotal: 0`, `failedRequestsTotal: 0` in every report. Documented orchestration-flake skips (`adminpanel` 1/6, `core-journey` 4/15) are acceptable — they are smoke-infra limits, not regressions.

- [ ] Local FE Jest: green.
- [ ] Local FE build: green, zero warnings.
- [ ] Local E2E (serial): green (8 pass, 2 documented fixme).
- [ ] (Optional) Local BE Jest: green.
- [ ] (Optional) Browser smokes: zero console/page/request errors per report.

---

## 2. Deploy

### 2.1 Vercel deploy

- [ ] Push the RC commit to the deploy branch (or merge the deploy PR).
- [ ] Vercel auto-builds. Confirm the build log shows:
      - `Compiled successfully.`
      - `The build folder is ready to be deployed.`
      - **No ESLint warnings.** (If warnings appear in CI but not locally, the env may be missing or different.)
- [ ] Confirm the build output sizes match expectations (`main.<hash>.js` ≈ 150 kB gzip; main CSS ≈ 33 kB gzip; route chunks ≤ 48 kB each).

### 2.2 Smoke production immediately after deploy

- [ ] `https://<production-host>/` returns 200 and serves the app shell.
- [ ] `https://<production-host>/api/health` returns 200 with body `{"ok":true,"status":"ok","service":"survey-builder-api","time":"<ISO>"}` — proves the Vercel rewrite to the BE is wired correctly *and* that the BE health route is mounted (it lives ahead of the DB-init middleware so cold-start pings stay cheap).
- [ ] Browser: open `/login`, sign in with a real Google account that has been invited.
- [ ] After sign-in, you land on `/` (state user) or `/admin` (admin).
- [ ] Open DevTools → Application → Local Storage: confirm a key like `sb-<project-ref>-auth-token` exists with a valid JSON session payload.
- [ ] Click "Sign out". DevTools → Application → Local Storage should NO LONGER contain any `sb-*` keys, no legacy `token` key, and sessionStorage should be empty.
- [ ] Try to navigate to `/admin` as an unauthenticated user → expect redirect to `/login`.
- [ ] Try to navigate to `/admin` as a non-admin → expect redirect to `/`.

### 2.3 Spot-check critical user flows

- [ ] **Survey List** loads with surveys for the signed-in user's state.
- [ ] **Survey Form**: create or edit a survey; save round-trips successfully.
- [ ] **Question List**: tab-deep-link `?tab=users` / `?tab=states` works (admin only).
- [ ] **Survey Preview**: enters phone-frame view, walks user-login → verify → language → survey phases.
- [ ] **Designation Mapping**: table loads with rows; Add form opens.
- [ ] **Access Sheet**: latest dump loads; Generate triggers a dump-success banner.
- [ ] **Import Survey**: dropzone visible; ImportValidator dropzone visible too.
- [ ] **Admin Panel** (admin only): User Management list + State Configuration list load.

If any spot-check fails:
1. Capture browser console + Network tab.
2. Promote the previous Vercel deployment back to Production (see § 4 Rollback).
3. File an issue with the captured evidence.

---

## 3. Post-deploy

- [ ] Notify stakeholders (release channel / email).
- [ ] Capture build hash + Vercel deployment URL in the release tracker for traceability.
- [ ] Monitor browser console error rate (if you have a JS error tracker hooked up — none ships in this repo today) for ≥ 1 hour.
- [ ] Monitor BE /api logs for any unexpected 4xx / 5xx burst from the FE host.

### 3.1 Backend uptime monitoring (Render Free)

The BE runs on Render Free and sleeps after ~15 min idle. An external 10-minute keep-awake ping is wired against `/api/health`. See `Survey-builder-BE/docs/UPTIME_MONITORING.md` for full details.

- [ ] Confirm `/api/health` returns HTTP 200 with body shape `{ ok, status, service, time }`. (`curl -i https://<your-render-backend>.onrender.com/api/health`)
- [ ] Configure the `BACKEND_HEALTH_URL` repository secret in the BE repo's **Settings → Secrets and variables → Actions**. Value example: `https://survey-builder-be.onrender.com/api/health`.
- [ ] Verify the **"Keep Render Backend Awake"** GitHub Actions workflow (`Survey-builder-BE/.github/workflows/keep-render-awake.yml`) ran at least once successfully (Actions tab → most recent green run).
- [ ] (Optional) Layer an UptimeRobot or cron-job.org monitor on the same `/api/health` URL with a 10-minute interval if you want pager-style alerting on top of the workflow. Setup instructions are in `UPTIME_MONITORING.md` § Options 2 & 3.
- [ ] Confirm no monitor is configured at intervals shorter than 5 minutes — anything faster eats Render free-tier hours without benefit.

---

## 4. Rollback

This RC is **frontend-only**. Rollback is a single Vercel action; no backend or DB work is required.

### 4.1 When to roll back

- A critical user flow listed in § 2.3 is broken in production.
- Console / network errors spike on the production host (not on the prior good build).
- Auth flow is broken (sign-in fails for known-good Google accounts).

### 4.2 How to roll back

1. **Vercel dashboard** → Project → Deployments tab.
2. Find the most recent deployment that was working in production.
3. Click the `…` menu → **Promote to Production**.
4. Vercel cuts over within seconds.

### 4.3 Verify after rollback

- [ ] `https://<production-host>/` serves the prior build hash (Network tab → `main.<hash>.js`).
- [ ] `/api/health` still 200 (unchanged BE).
- [ ] A signed-in user can still reach Survey List.
- [ ] Sign-out still purges `sb-*` keys.

### 4.4 Things NOT to touch on rollback

- ❌ Do NOT roll back the backend (`Survey-builder-BE`) — it didn't change in this release.
- ❌ Do NOT run any database migration to roll back — there is no schema change in this release.
- ❌ Do NOT rotate Supabase keys — they didn't change in this release.
- ❌ Do NOT clear Supabase users / RLS policies — they didn't change in this release.

### 4.5 Reason to escalate (instead of rolling back)

- If users report **data loss** (a survey or question disappearing), that is **not** a FE issue and rollback won't help. Escalate to the backend / database on-call; capture the surveyId and the user's stateCode.
- If users report **wrong-state data visibility** (a state user seeing another state's data), that is a backend RBAC concern (the FE has no authoritative state-scoping). Escalate to the backend on-call; rollback alone won't fix it.

---

## 5. Build artefact + reproducibility

- The FE build is fully reproducible from the commit hash + the env values listed in § 1.2.
- The BE is at `https://survey-builder-be.onrender.com` (per `vercel.json` rewrite). It is on a separate repo and lifecycle.
- The build does NOT bundle the BE; it relies on the rewrite at request time.

If you need to ship the FE to a new domain or environment:
1. Set the env vars in § 1.2 for that environment.
2. Update `vercel.json` if the BE host differs.
3. Repeat § 1.3 then § 2 against the new target.

---

## Reference — commands quick card

```bash
# Frontend (run from Survey-builder-FE/)
npm ci
npm run test:ci          # FE Jest (CI mode)
npm test                 # FE Jest (watch mode, dev only)
npm run build            # Production build → build/
npm start                # Dev server on :3000 (proxy → :5001)
npm run e2e              # Playwright E2E (parallel)
npm run e2e -- --workers=1   # Playwright E2E (serial — recommended for CI)

# Backend (run from Survey-builder-BE/)
npm ci
npm test                 # BE Jest (serial)
npm start                # Production server (node app.js)
npm run dev              # Nodemon dev server

# Browser smokes (require dev server on :3000 and/or `npx serve -s build -l 3030`)
node Survey-builder-FE/smoke/<name>-smoke.js
```
