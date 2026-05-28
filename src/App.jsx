import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PublicOnlyRoute from './components/PublicOnlyRoute';
import ErrorBoundary from './components/ErrorBoundary';
import AppLoader from './components/AppLoader';
import Login from './components/Login';
import AccessDenied from './components/AccessDenied';
import Sidebar from './components/ui/Sidebar';
import TopNav from './components/ui/TopNav';
// Tweaks feature disabled — TweaksPanel import intentionally commented out.
// Re-enable by uncommenting this import AND the panel render below in AppShell.
// import TweaksPanel from './components/ui/TweaksPanel';
import CommandPalette from './components/ui/CommandPalette';
import ReconnectBanner from './components/ReconnectBanner';
import useTweaks from './hooks/useTweaks';
import './App.css';
import './swiftchatRedesign.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,   // 2 minutes — data is fresh, no refetch on revisit
      retry: (failureCount, error) => {
        // Don't retry client errors (4xx) except 408 (timeout) and 429 (rate limit)
        const status = error?.response?.status;
        if (status && status < 500 && status !== 408 && status !== 429) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
      refetchOnWindowFocus: true,
    },
  },
});

/* Lazy-loaded route components — each gets its own chunk */
const SurveyList = lazy(() => import('./components/SurveyList'));
const SurveyForm = lazy(() => import('./components/SurveyForm'));
const QuestionList = lazy(() => import('./components/QuestionList'));
const QuestionForm = lazy(() => import('./components/QuestionForm'));
const SurveyPreview = lazy(() => import('./components/preview/SurveyPreview'));
const ImportSurvey = lazy(() => import('./components/ImportSurvey'));
const DumpsheetValidator = lazy(() => import('./components/DumpsheetValidator'));
const DesignationMapping = lazy(() => import('./components/DesignationMapping'));
const AccessSheet = lazy(() => import('./components/AccessSheet'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));

/* Suspense fallback for lazy route chunks — uses the branded loader so the
   experience is consistent with the auth bootstrap loader. The lazy chunk
   normally finishes in <300ms; the loader's timeout-aware copy covers the
   slow-network case. */
const PageLoader = () => <AppLoader title="Loading…" showLogo={false} testId="page-loader" />;

/**
 * StateOnlyRoute — redirects admin users to /admin.
 * State users pass through normally.
 */
const StateOnlyRoute = ({ children }) => {
  const { user } = useAuth();
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
  return children;
};

/* ─── Custom Cursor Component ─── */
const CustomCursor = () => {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const pos = useRef({ x: 0, y: 0 });
  const visible = useRef(false);

  useEffect(() => {
    // Skip custom cursor on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const onMove = (e) => {
      pos.current = { x: e.clientX, y: e.clientY };
      if (!visible.current) {
        visible.current = true;
        dot.style.opacity = '1';
        ring.style.opacity = '1';
      }
      dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      ring.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };

    const onLeave = () => {
      visible.current = false;
      dot.style.opacity = '0';
      ring.style.opacity = '0';
    };

    const onDown = () => ring.classList.add('click');
    const onUp = () => ring.classList.remove('click');

    // Hover-link detection for interactive elements
    const onOverCapture = (e) => {
      const el = e.target.closest('a, button, input, select, textarea, [role="button"], .btn, .nav-link, .survey-card, .stat-card, .theme-toggle');
      if (el) {
        ring.classList.add('hover-link');
      }
    };
    const onOutCapture = (e) => {
      const el = e.target.closest('a, button, input, select, textarea, [role="button"], .btn, .nav-link, .survey-card, .stat-card, .theme-toggle');
      if (el) {
        ring.classList.remove('hover-link');
      }
    };

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('mouseover', onOverCapture, true);
    document.addEventListener('mouseout', onOutCapture, true);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('mouseover', onOverCapture, true);
      document.removeEventListener('mouseout', onOutCapture, true);
    };
  }, []);

  return (
    <>
      <div ref={dotRef} className="custom-cursor" />
      <div ref={ringRef} className="custom-cursor-ring" />
    </>
  );
};

/**
 * AppShell — composes the new fmb-* sidebar/topnav with the existing
 * legacy `.app` + `.main-content` containers. Keeping both classes
 * means App.css's flex layout and per-screen styling still apply,
 * while the @media collapse rule in ui.css can target this container
 * via `.fmb-app-shell[data-nav]`.
 *
 * The Tweaks panel and command palette are owned here (not inside the
 * sidebar) so they remain accessible regardless of which nav variant
 * is selected, and so ⌘K works app-wide.
 */
function AppShell({ children }) {
  // useTweaks is still invoked because it applies persisted theme / density /
  // accent / font / nav choices from localStorage on mount. The interactive
  // Tweaks panel is disabled (see App.jsx import + render below), so the
  // setter + reset slots from the tuple are not destructured while the
  // feature is off.
  const [tweaks /* , setTweak, resetTweaks */] = useTweaks();
  const [cmdOpen, setCmdOpen] = useState(false);
  // Tweaks feature disabled — panel-open state intentionally commented out.
  // const [tweaksOpen, setTweaksOpen] = useState(false);

  // Global ⌘K / Ctrl+K toggle for the command palette. Intentionally
  // ignored when an editable input/textarea is focused so the user can
  // still type "k" without hijacking it.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key && e.key.toLowerCase() === 'k') {
        const t = e.target;
        const isEditable =
          t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (!isEditable) {
          e.preventDefault();
          setCmdOpen((v) => !v);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isTop = tweaks.nav === 'top';

  return (
    // Note: the legacy `.app` class is intentionally NOT applied here. Both
    // `.app` (display:flex; flex-direction:row + @media collapse to column)
    // and `.fmb-app-shell` (display:grid; grid-template-columns: nav 1fr)
    // were previously on this root and fought each other in the cascade —
    // App.css loads AFTER ui.css, so `.app`'s flex won, the `.fmb-app-shell`
    // grid lost its column track, and at <768px `.app { flex-direction:
    // column }` stacked the sidebar above main full-width. Same story for
    // `.main-content` on <main>: its 2.5rem/2rem padding masked the shell's
    // own paddings and the @media rules collided. Both classes are now
    // owned exclusively by `.fmb-app-shell` / `.fmb-main-pane`.
    <div
      className="fmb-app-shell"
      data-nav={isTop ? 'top' : 'side'}
    >
      {/* Tweaks feature disabled — onTweaksOpen prop intentionally omitted so
          the sliders icon does not render in Sidebar/TopNav. Re-enable by
          uncommenting the TweaksPanel import + render below and passing
          `onTweaksOpen={() => setTweaksOpen(true)}` through here. */}
      {isTop
        ? <TopNav  onSearchOpen={() => setCmdOpen(true)} />
        : <Sidebar onSearchOpen={() => setCmdOpen(true)} />}

      <main className="fmb-main-pane">
        {/*
          Non-blocking reconnect banner. Renders null unless AuthContext
          is in the stale-while-revalidate "RECONNECTING" state.

          It MUST live inside <main> — when it was a direct grid sibling of
          Sidebar/Main/CommandPalette in the 2-column shell, CSS Grid's
          auto-placement filled (row 1, col 2) with the banner and pushed
          Main into (row 2, col 1), the 240px sidebar column. That produced
          the hosted-app symptom: "main mostly empty, content squeezed into
          a narrow column, banner floating in middle of empty canvas".
        */}
        <ReconnectBanner />
        {children}
      </main>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      {/* <TweaksPanel
        open={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
        values={tweaks}
        setTweak={setTweak}
        onReset={resetTweaks}
      /> */}
    </div>
  );
}

function App() {
  useEffect(() => {
    // Note: useTweaks now drives [data-theme] / [data-accent] / [data-font]
    // and the body density class. We leave data-bs-theme + the legacy
    // localStorage('theme') write in place because the existing App.css
    // and Bootstrap-derived styling read them.
    document.documentElement.setAttribute('data-bs-theme', 'light');
    localStorage.setItem('theme', 'light');
    // Backend warmup is owned by AuthContext now — it serialises a bounded
    // /api/health probe in front of /api/auth/me when a persisted Supabase
    // session is present, so the cold-start wait lands on the cheap public
    // endpoint instead of the bootstrap probe. For unauthenticated mounts,
    // we deliberately do NOT pre-warm: there is no upcoming authed call to
    // protect, and idle warmups would amplify Render free-tier usage.
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
    <Router>
      <AuthProvider>
        <ToastProvider>
          <CustomCursor />
          <Routes>
            {/* Public-only route — authenticated users are redirected away. */}
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <Login />
                </PublicOnlyRoute>
              }
            />

            {/*
              Access-denied is a free route — it must render with or
              without an auth session (someone may deep-link to it after
              an admin tells them their request is pending). The component
              itself reads useAuth() and redirects authorized users home
              so they can't get stuck here.
            */}
            <Route path="/access-denied" element={<AccessDenied />} />

            {/* All other routes are protected */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <ErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                    <Routes>
                      {/* State-user-only routes — admin is redirected to /admin */}
                      <Route path="/" element={<StateOnlyRoute><SurveyList /></StateOnlyRoute>} />
                      <Route path="/surveys/new" element={<StateOnlyRoute><SurveyForm /></StateOnlyRoute>} />
                      <Route path="/surveys/:surveyId/edit" element={<StateOnlyRoute><SurveyForm /></StateOnlyRoute>} />
                      <Route path="/surveys/:surveyId/questions" element={<StateOnlyRoute><QuestionList /></StateOnlyRoute>} />
                      <Route path="/surveys/:surveyId/questions/new" element={<StateOnlyRoute><QuestionForm /></StateOnlyRoute>} />
                      <Route path="/surveys/:surveyId/questions/:questionId/edit" element={<StateOnlyRoute><QuestionForm /></StateOnlyRoute>} />
                      <Route path="/surveys/:surveyId/preview" element={<StateOnlyRoute><SurveyPreview /></StateOnlyRoute>} />
                      <Route path="/import" element={<StateOnlyRoute><ImportSurvey /></StateOnlyRoute>} />
                      <Route path="/validator" element={<StateOnlyRoute><DumpsheetValidator /></StateOnlyRoute>} />
                      <Route path="/designations" element={<StateOnlyRoute><DesignationMapping /></StateOnlyRoute>} />
                      <Route path="/access-sheet" element={<StateOnlyRoute><AccessSheet /></StateOnlyRoute>} />

                      {/* Admin-only route */}
                      <Route
                        path="/admin"
                        element={
                          <ProtectedRoute requiredRole="admin">
                            <AdminPanel />
                          </ProtectedRoute>
                        }
                      />

                      {/* Unknown protected paths — deterministic fallback.
                          Admins land on /admin, state users on /. Avoids the
                          "blank page on typo'd URL" failure mode. */}
                      <Route path="*" element={<StateOnlyRoute><Navigate to="/" replace /></StateOnlyRoute>} />
                    </Routes>
                    </Suspense>
                    </ErrorBoundary>
                  </AppShell>
                </ProtectedRoute>
              }
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </Router>
    </QueryClientProvider>
  );
}

export default App;
