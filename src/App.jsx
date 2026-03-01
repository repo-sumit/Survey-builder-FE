import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './components/Login';
import Navigation from './components/Navigation';
import SurveyList from './components/SurveyList';
import SurveyForm from './components/SurveyForm';
import QuestionList from './components/QuestionList';
import QuestionForm from './components/QuestionForm';
import SurveyPreview from './components/preview/SurveyPreview';
import ImportSurvey from './components/ImportSurvey';
import DesignationMapping from './components/DesignationMapping';
import AccessSheet from './components/AccessSheet';
import AdminPanel from './components/AdminPanel';
import './App.css';

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
