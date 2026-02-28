import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
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
                        <Route path="/" element={<SurveyList />} />
                        <Route path="/surveys/new" element={<SurveyForm />} />
                        <Route path="/surveys/:surveyId/edit" element={<SurveyForm />} />
                        <Route path="/surveys/:surveyId/questions" element={<QuestionList />} />
                        <Route path="/surveys/:surveyId/questions/new" element={<QuestionForm />} />
                        <Route path="/surveys/:surveyId/questions/:questionId/edit" element={<QuestionForm />} />
                        <Route path="/surveys/:surveyId/preview" element={<SurveyPreview />} />
                        <Route path="/import" element={<ImportSurvey />} />
                        <Route path="/designations" element={<DesignationMapping />} />
                        <Route path="/access-sheet" element={<AccessSheet />} />
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
