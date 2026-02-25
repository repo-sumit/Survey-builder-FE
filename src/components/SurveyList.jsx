import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { surveyAPI } from '../services/api';
import DuplicateSurveyModal from './DuplicateSurveyModal';

const SurveyList = () => {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [duplicatingModal, setDuplicatingModal] = useState(null);
  const navigate = useNavigate();

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
        alert('Failed to delete survey');
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

  if (loading) {
    return <div className="loading">Loading surveys...</div>;
  }

  const activeSurveys = surveys.filter(s => s.isActive === 'Yes').length;
  const totalSurveys = surveys.length;

  return (
    <div className="survey-list-container">
      <div className="dashboard-header">
        <h1>FMB Survey Builder Dashboard</h1>
        <p>Create and manage surveys with automatic Excel export functionality</p>
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalSurveys}</div>
          <div className="stat-label">Total Surveys</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{activeSurveys}</div>
          <div className="stat-label">Active Surveys</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalSurveys - activeSurveys}</div>
          <div className="stat-label">Inactive Surveys</div>
        </div>
      </div>

      <div className="list-header">
        <h2>Surveys</h2>
        <div className="header-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/import')}
          >
            📥 Import Survey
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/surveys/new')}
          >
            ✚ Create New Survey
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {surveys.length === 0 ? (
        <div className="empty-state">
          <p>No surveys found. Create your first survey to get started.</p>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/surveys/new')}
          >
            Create New Survey
          </button>
        </div>
      ) : (
        <div className="survey-grid">
          {surveys.map(survey => (
            <div key={survey.surveyId} className="survey-card">
              <div className="survey-card-header">
                <h3>{survey.surveyName}</h3>
                <span className="survey-id">{survey.surveyId}</span>
              </div>
              <p className="survey-description">{survey.surveyDescription}</p>
              <div className="survey-meta">
                <span className="badge">{survey.isActive === 'Yes' ? 'Active' : 'Inactive'}</span>
                <span className="badge">{survey.public === 'Yes' ? 'Public' : 'Private'}</span>
                {survey.mode && <span className="badge badge-mode">{survey.mode}</span>}
              </div>
              <div className="survey-actions">
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/surveys/${survey.surveyId}/questions`)}
                >
                  Questions
                </button>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/surveys/${survey.surveyId}/preview`)}
                >
                  Preview
                </button>
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
                >
                  Delete
                </button>
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
