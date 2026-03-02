import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './components/Login';
import Navigation from './components/Navigation';
import './App.css';

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

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
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
