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
        <div className="skeleton skeleton-card mb-4" style={{ height: 72 }} />
        <div className="row g-3 mb-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="col-4">
              <div className="skeleton" style={{ height: 80, borderRadius: 12 }} />
            </div>
          ))}
        </div>
        <div className="row g-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="col-md-6 col-xl-4">
              <div className="skeleton skeleton-card" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const activeSurveys  = surveys.filter(s => s.isActive === 'Yes').length;
  const totalSurveys   = surveys.length;

  return (
    <div className="survey-list-container">

      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="d-flex align-items-start justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="fw-bold mb-1" style={{ fontSize: '1.35rem' }}>Surveys</h2>
          <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
            Create and manage surveys with automatic Excel export functionality
          </p>
        </div>
        {!isReadOnly && (
          <div className="d-flex gap-2 flex-wrap">
            <button
              className="btn btn-outline-secondary btn-sm fw-semibold"
              onClick={() => navigate('/import')}
            >
              Import
            </button>
            <button
              className="btn btn-primary btn-sm fw-semibold"
              onClick={() => navigate('/surveys/new')}
            >
              + Create Survey
            </button>
          </div>
        )}
      </div>

      {/* ── Stat Cards ───────────────────────────────────────────── */}
      <div className="row g-3 mb-4">
        <div className="col-4">
          <div className="card border-0 shadow-sm text-center">
            <div className="card-body py-3 px-2">
              <div className="fw-bold" style={{ fontSize: '1.75rem', color: 'var(--bs-primary)' }}>
                {totalSurveys}
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Total</div>
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className="card border-0 shadow-sm text-center">
            <div className="card-body py-3 px-2">
              <div className="fw-bold" style={{ fontSize: '1.75rem', color: '#198754' }}>
                {activeSurveys}
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Active</div>
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className="card border-0 shadow-sm text-center">
            <div className="card-body py-3 px-2">
              <div className="fw-bold" style={{ fontSize: '1.75rem', color: '#6c757d' }}>
                {totalSurveys - activeSurveys}
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Inactive</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────── */}
      {error && (
        <div className="alert alert-danger py-2 px-3 mb-4" style={{ fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* ── Empty State ──────────────────────────────────────────── */}
      {surveys.length === 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center py-5">
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
            <h5 className="fw-semibold mb-2">No surveys yet</h5>
            <p className="text-muted mb-4" style={{ fontSize: '0.875rem' }}>
              Create your first survey to get started.
            </p>
            {!isReadOnly && (
              <button
                className="btn btn-primary btn-sm fw-semibold"
                onClick={() => navigate('/surveys/new')}
              >
                + Create New Survey
              </button>
            )}
          </div>
        </div>
      ) : (

        /* ── Survey Cards Grid ─────────────────────────────────── */
        <div className="row g-3">
          {surveys.map(survey => (
            <div key={survey.surveyId} className="col-md-6 col-xl-4">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body d-flex flex-column p-3">

                  {/* Title row */}
                  <div className="d-flex align-items-start justify-content-between gap-2 mb-1">
                    <h6 className="fw-bold mb-0" style={{ fontSize: '0.95rem', lineHeight: 1.35 }}>
                      {survey.surveyName}
                    </h6>
                    {isPublished(survey) && (
                      <span className="badge bg-success flex-shrink-0" style={{ fontSize: '0.68rem' }}>
                        Published
                      </span>
                    )}
                  </div>

                  {/* Survey ID */}
                  <div className="mb-2" style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--bs-secondary-color)' }}>
                    {survey.surveyId}
                  </div>

                  {/* Description */}
                  {survey.surveyDescription && (
                    <p className="text-muted mb-2" style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>
                      {survey.surveyDescription}
                    </p>
                  )}

                  {/* Badges */}
                  <div className="d-flex flex-wrap gap-1 mb-3">
                    <span
                      className={`badge ${survey.isActive === 'Yes' ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}`}
                      style={{ fontSize: '0.7rem' }}
                    >
                      {survey.isActive === 'Yes' ? 'Active' : 'Inactive'}
                    </span>
                    <span
                      className={`badge ${survey.public === 'Yes' ? 'bg-primary-subtle text-primary' : 'bg-secondary-subtle text-secondary'}`}
                      style={{ fontSize: '0.7rem' }}
                    >
                      {survey.public === 'Yes' ? 'Public' : 'Private'}
                    </span>
                    {survey.mode && (
                      <span className="badge bg-info-subtle text-info" style={{ fontSize: '0.7rem' }}>
                        {survey.mode}
                      </span>
                    )}
                    {survey.stateCode && (
                      <span className="badge bg-warning-subtle text-warning-emphasis" style={{ fontSize: '0.7rem' }}>
                        {survey.stateCode}
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-auto d-flex flex-wrap gap-1">
                    <button
                      className="btn btn-outline-primary btn-sm"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => navigate(`/surveys/${survey.surveyId}/questions`)}
                    >
                      Question Master
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => navigate(`/surveys/${survey.surveyId}/preview`)}
                    >
                      Preview
                    </button>
                    {!isReadOnly && (
                      <>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => handleDuplicate(survey)}
                        >
                          Duplicate
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => navigate(`/surveys/${survey.surveyId}/edit`)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-outline-danger btn-sm"
                          style={{ fontSize: '0.75rem' }}
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
