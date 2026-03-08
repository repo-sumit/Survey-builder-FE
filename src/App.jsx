import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './components/Login';
import Navigation from './components/Navigation';
import './App.css';
import './swiftchatRedesign.css';

/* Lazy-loaded route components — each gets its own chunk */
const SurveyList = lazy(() => import('./components/SurveyList'));
const SurveyForm = lazy(() => import('./components/SurveyForm'));
const QuestionList = lazy(() => import('./components/QuestionList'));
const QuestionForm = lazy(() => import('./components/QuestionForm'));
const SurveyPreview = lazy(() => import('./components/preview/SurveyPreview'));
const ImportSurvey = lazy(() => import('./components/ImportSurvey'));
const DesignationMapping = lazy(() => import('./components/DesignationMapping'));
const AccessSheet = lazy(() => import('./components/AccessSheet'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));

/* Minimal loading fallback */
const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-3)' }}>
    Loading…
  </div>
);

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

function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const preferDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isValidSavedTheme = savedTheme === 'dark' || savedTheme === 'light';
    const theme = isValidSavedTheme ? savedTheme : (preferDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
  }, []);

  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <CustomCursor />
          <Routes>
            {/* Public route — login */}
            <Route path="/login" element={<Login />} />

            {/* All other routes are protected */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <div className="app">
                    <Navigation />
                    <main className="main-content">
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
                      </Routes>
                      </Suspense>
                    </main>
                  </div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
