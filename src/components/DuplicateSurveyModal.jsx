import React, { useState } from 'react';

const DuplicateSurveyModal = ({ survey, onConfirm, onCancel }) => {
  const [newSurveyId, setNewSurveyId] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate survey ID format
    if (!newSurveyId.trim()) {
      setError('Survey ID is required');
      return;
    }
    
    if (!/^[A-Za-z0-9_]+$/.test(newSurveyId)) {
      setError('Survey ID must contain only alphanumeric characters and underscores');
      return;
    }
    
    onConfirm(newSurveyId.trim());
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Duplicate Survey</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        
        <div className="modal-body">
          <p>You are duplicating: <strong>{survey.surveyName}</strong> (ID: {survey.surveyId})</p>
          <p className="modal-description">
            All questions, options, translations, and hierarchy values will be copied. 
            Launch and close dates will be reset.
          </p>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="newSurveyId">
                New Survey ID <span className="required">*</span>
              </label>
              <input
                id="newSurveyId"
                type="text"
                value={newSurveyId}
                onChange={(e) => {
                  setNewSurveyId(e.target.value);
                  setError('');
                }}
                placeholder="Enter new survey ID (e.g., SURVEY_02)"
                className={error ? 'error' : ''}
                autoFocus
              />
              {error && <span className="error-text">{error}</span>}
              <small>Must contain only alphanumeric characters and underscores</small>
            </div>
            
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Duplicate Survey
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DuplicateSurveyModal;
