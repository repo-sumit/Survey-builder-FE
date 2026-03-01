import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { surveyAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import DuplicateSurveyModal from './DuplicateSurveyModal';

const SurveyList = () => {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [duplicatingModal, setDuplicatingModal] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const isReadOnly = user?.role !== 'admin' && !user?.isActive;

  useEffect(() => {
    loadSurveys();
  }, []);

  const loadSurveys = async () => {
    try {
      setLoading(true);
      const data = await surveyAPI.getAll();
      setSurveys(data);
      setError(null);
    } catch (err) {
      setError('Failed to load surveys');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (surveyId) => {
    if (window.confirm('Are you sure you want to delete this survey? All associated questions will also be deleted.')) {
      try {
        await surveyAPI.delete(surveyId);
        loadSurveys();
      } catch (err) {
        const msg = err.response?.data?.error || 'Failed to delete survey';
        alert(msg);
        console.error(err);
      }
    }
  };

  const handleDuplicate = (survey) => {
    setDuplicatingModal(survey);
  };

  const handleDuplicateConfirm = async (newSurveyId) => {
    try {
      await surveyAPI.duplicate(duplicatingModal.surveyId, newSurveyId);
      setDuplicatingModal(null);
      loadSurveys();
      alert(`Survey duplicated successfully as ${newSurveyId}`);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Failed to duplicate survey';
      alert(errorMessage);
      console.error(err);
    }
  };

  const isPublished = (survey) => survey.publish?.status === 'PUBLISHED';

  if (loading) {
    return (
      <div className="survey-list-container">
        <div className="skeleton skeleton-card" style={{ height: 72, marginBottom: '1.5rem' }} />
        <div className="stats-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
          ))}
        </div>
        <div className="survey-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  const activeSurveys  = surveys.filter(s => s.isActive === 'Yes').length;
  const totalSurveys   = surveys.length;

  return (
    <div className="survey-list-container">

      {/* ── Page Header ── */}
      <div className="list-header">
        <div>
          <h2>Surveys</h2>
          <p className="subtitle">Create and manage surveys with automatic Excel export functionality</p>
        </div>
        {!isReadOnly && (
          <div className="header-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/import')}
            >
              Import
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/surveys/new')}
            >
              + Create Survey
            </button>
          </div>
        )}
      </div>

      {/* ── Stat Cards ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalSurveys}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{activeSurveys}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--text-3)' }}>{totalSurveys - activeSurveys}</div>
          <div className="stat-label">Inactive</div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && <div className="error-message">{error}</div>}

      {/* ── Empty State ── */}
      {surveys.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
          <p>No surveys yet. {!isReadOnly && <strong>Create your first survey to get started.</strong>}</p>
          {!isReadOnly && (
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: '1.25rem' }}
              onClick={() => navigate('/surveys/new')}
            >
              + Create New Survey
            </button>
          )}
        </div>
      ) : (

        /* ── Survey Cards Grid ── */
        <div className="survey-grid">
          {surveys.map(survey => (
            <div key={survey.surveyId} className="survey-card">

              {/* Title row */}
              <div className="survey-card-header">
                <h3>{survey.surveyName}</h3>
                {isPublished(survey) && (
                  <span className="badge badge-published">Published</span>
                )}
              </div>

              {/* Survey ID */}
              <div className="survey-id">{survey.surveyId}</div>

              {/* Description */}
              {survey.surveyDescription && (
                <p className="survey-description">{survey.surveyDescription}</p>
              )}

              {/* Badges */}
              <div className="survey-meta">
                <span className={`badge ${survey.isActive === 'Yes' ? 'badge-active' : 'badge-inactive'}`}>
                  {survey.isActive === 'Yes' ? 'Active' : 'Inactive'}
                </span>
                <span className="badge">
                  {survey.public === 'Yes' ? 'Public' : 'Private'}
                </span>
                {survey.mode && (
                  <span className="badge badge-mode">{survey.mode}</span>
                )}
                {survey.stateCode && (
                  <span className="badge badge-state">{survey.stateCode}</span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="survey-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/surveys/${survey.surveyId}/questions`)}
                >
                  Question Master
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/surveys/${survey.surveyId}/preview`)}
                >
                  Preview
                </button>
                {!isReadOnly && (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDuplicate(survey)}
                    >
                      Duplicate
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/surveys/${survey.surveyId}/edit`)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(survey.surveyId)}
                      disabled={isPublished(survey)}
                      title={isPublished(survey) ? 'Cannot delete a published survey' : 'Delete'}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {duplicatingModal && (
        <DuplicateSurveyModal
          survey={duplicatingModal}
          onConfirm={handleDuplicateConfirm}
          onCancel={() => setDuplicatingModal(null)}
        />
      )}
    </div>
  );
};

export default SurveyList;
