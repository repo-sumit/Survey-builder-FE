import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { surveyAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import DuplicateSurveyModal from './DuplicateSurveyModal';
import { useToast } from './Toast';

const SurveyList = () => {
  const [duplicatingModal, setDuplicatingModal] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const isReadOnly = user?.role !== 'admin' && !user?.isActive;

  const { data: surveys = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ['surveys'],
    queryFn: surveyAPI.getAll,
  });

  const error = queryError ? 'Failed to load surveys' : null;

  const deleteMutation = useMutation({
    mutationFn: (surveyId) => surveyAPI.delete(surveyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['surveys'] }),
    onError: (err) => {
      const msg = err.response?.data?.error || 'Failed to delete survey';
      toast.error(msg);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ surveyId, newSurveyId }) => surveyAPI.duplicate(surveyId, newSurveyId),
    onSuccess: (_, { newSurveyId }) => {
      setDuplicatingModal(null);
      queryClient.invalidateQueries({ queryKey: ['surveys'] });
      toast.success(`Survey duplicated successfully as ${newSurveyId}`);
    },
    onError: (err) => {
      const errorMessage = err.response?.data?.error || 'Failed to duplicate survey';
      toast.error(errorMessage);
    },
  });

  const handleDelete = (surveyId) => {
    if (window.confirm('Are you sure you want to delete this survey? All associated questions will also be deleted.')) {
      deleteMutation.mutate(surveyId);
    }
  };

  const handleDuplicate = (survey) => {
    setDuplicatingModal(survey);
  };

  const handleDuplicateConfirm = (newSurveyId) => {
    duplicateMutation.mutate({ surveyId: duplicatingModal.surveyId, newSurveyId });
  };

  const isPublished = (survey) => survey.publish?.status === 'PUBLISHED';

  /* Card spotlight: track mouse position relative to card for glow effect */
  const handleCardMouseMove = useCallback((e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  }, []);

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
              className="btn btn-secondary btn-sm btn-cta btn-icon-import"
              onClick={() => navigate('/import')}
            >
              Import
            </button>
            <button
              className="btn btn-primary btn-sm btn-cta btn-icon-create"
              onClick={() => navigate('/surveys/new')}
            >
              Create Survey
            </button>
          </div>
        )}
      </div>

      {/* ── Stat Cards ── */}
      <div className="stats-grid">
        <div className="stat-card" onMouseMove={handleCardMouseMove}>
          <div className="stat-value">{totalSurveys}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat-card" onMouseMove={handleCardMouseMove}>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{activeSurveys}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card" onMouseMove={handleCardMouseMove}>
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
              className="btn btn-primary btn-sm btn-cta btn-icon-create"
              style={{ marginTop: '1.25rem' }}
              onClick={() => navigate('/surveys/new')}
            >
              Create New Survey
            </button>
          )}
        </div>
      ) : (

        /* ── Survey Cards Grid ── */
        <div className="survey-grid">
          {surveys.map(survey => (
            <div key={survey.surveyId} className="survey-card" onMouseMove={handleCardMouseMove}>

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
                  className="btn btn-primary btn-sm btn-cta btn-icon-question-master"
                  onClick={() => navigate(`/surveys/${survey.surveyId}/questions`)}
                >
                  Question Master
                </button>
                <button
                  className="btn btn-secondary btn-sm btn-cta btn-icon-preview"
                  onClick={() => navigate(`/surveys/${survey.surveyId}/preview`)}
                >
                  Preview
                </button>
                {!isReadOnly && (
                  <>
                    <button
                      className="btn btn-secondary btn-sm btn-cta btn-icon-duplicate"
                      onClick={() => handleDuplicate(survey)}
                    >
                      Duplicate
                    </button>
                    <button
                      className="btn btn-secondary btn-sm btn-edit btn-cta btn-icon-edit"
                      onClick={() => navigate(`/surveys/${survey.surveyId}/edit`)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-sm btn-cta btn-icon-delete"
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
