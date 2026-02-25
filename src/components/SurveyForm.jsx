import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { surveyAPI } from '../services/api';
import { useValidation } from '../hooks/useValidation';
import { AVAILABLE_MEDIUMS } from '../schemas/validationConstants';

const SurveyForm = () => {
  const navigate = useNavigate();
  const { surveyId } = useParams();
  const isEdit = Boolean(surveyId);
  const { errors, validateSurvey, setErrors } = useValidation();

  const [formData, setFormData] = useState({
    surveyId: '',
    surveyName: '',
    surveyDescription: '',
    availableMediums: [],
    hierarchicalAccessLevel: '',
    public: 'Yes',
    inSchool: 'Yes',
    acceptMultipleEntries: 'Yes',
    launchDate: '',
    closeDate: '',
    mode: 'New Data',
    visibleOnReportBot: 'No',
    isActive: 'Yes',
    downloadResponse: 'No',
    geoFencing: 'No',
    geoTagging: 'No',
    testSurvey: 'No'
  });

  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [hierarchyInput, setHierarchyInput] = useState('');
  const [hierarchyLevels, setHierarchyLevels] = useState([]);
  const [showMediumDropdown, setShowMediumDropdown] = useState(false);
  const mediumDropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mediumDropdownRef.current && !mediumDropdownRef.current.contains(event.target)) {
        setShowMediumDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isEdit) {
      loadSurvey();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  const loadSurvey = async () => {
    try {
      const data = await surveyAPI.getById(surveyId);
      // Convert availableMediums string to array if needed
      if (typeof data.availableMediums === 'string') {
        data.availableMediums = data.availableMediums ? data.availableMediums.split(',') : [];
      }
      setFormData(data);
      // Set hierarchy levels for display
      if (data.hierarchicalAccessLevel) {
        setHierarchyLevels(data.hierarchicalAccessLevel.split(',').filter(l => l.trim()));
      }
    } catch (err) {
      alert('Failed to load survey');
      navigate('/');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const toggleMedium = (medium) => {
    const currentMediums = Array.isArray(formData.availableMediums) 
      ? formData.availableMediums 
      : [];
    
    let newMediums;
    if (currentMediums.includes(medium)) {
      newMediums = currentMediums.filter(m => m !== medium);
    } else {
      newMediums = [...currentMediums, medium];
    }
    
    setFormData(prev => ({
      ...prev,
      availableMediums: newMediums
    }));
    
    // Clear error
    if (errors.availableMediums) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.availableMediums;
        return newErrors;
      });
    }
  };

  const removeMedium = (medium) => {
    const newMediums = formData.availableMediums.filter(m => m !== medium);
    setFormData(prev => ({
      ...prev,
      availableMediums: newMediums
    }));
  };

  const handleDateChange = (date, field) => {
    if (date) {
      // Format to DD/MM/YYYY HH:MM:SS
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      
      // Auto-set time based on field type
      let hours, minutes, seconds;
      if (field === 'launchDate') {
        // Launch Date: auto set to 00:00:00
        hours = '00';
        minutes = '00';
        seconds = '00';
      } else if (field === 'closeDate') {
        // Close Date: auto set to 23:59:59
        hours = '23';
        minutes = '59';
        seconds = '59';
      } else {
        // For any other date field, use current time
        hours = String(date.getHours()).padStart(2, '0');
        minutes = String(date.getMinutes()).padStart(2, '0');
        seconds = String(date.getSeconds()).padStart(2, '0');
      }
      
      const formatted = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
      
      setFormData(prev => ({
        ...prev,
        [field]: formatted
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: ''
      }));
    }
    
    // Clear error
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Parse DD/MM/YYYY HH:MM:SS to Date object
  const parseDate = (dateString) => {
    if (!dateString) return null;
    try {
      const [datePart, timePart] = dateString.split(' ');
      const [day, month, year] = datePart.split('/').map(Number);
      
      if (timePart) {
        const [hours, minutes, seconds] = timePart.split(':').map(Number);
        return new Date(year, month - 1, day, hours, minutes, seconds);
      } else {
        return new Date(year, month - 1, day);
      }
    } catch (e) {
      return null;
    }
  };

  const handleAddHierarchyLevel = () => {
    if (hierarchyInput && /^\d+$/.test(hierarchyInput)) {
      if (!hierarchyLevels.includes(hierarchyInput)) {
        const newLevels = [...hierarchyLevels, hierarchyInput];
        setHierarchyLevels(newLevels);
        setFormData(prev => ({
          ...prev,
          hierarchicalAccessLevel: newLevels.join(',')
        }));
        setHierarchyInput('');
      } else {
        alert('This hierarchy level already exists');
      }
    } else {
      alert('Please enter a valid numeric value');
    }
  };

  const handleRemoveHierarchyLevel = (level) => {
    const newLevels = hierarchyLevels.filter(l => l !== level);
    setHierarchyLevels(newLevels);
    setFormData(prev => ({
      ...prev,
      hierarchicalAccessLevel: newLevels.join(',')
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setErrors({});

    // Validate required fields first
    if (!formData.surveyId || !formData.surveyId.trim()) {
      setSubmitError('Survey ID is required');
      setErrors({ surveyId: 'Survey ID is required' });
      return;
    }
    if (!formData.surveyName || !formData.surveyName.trim()) {
      setSubmitError('Survey Name is required');
      setErrors({ surveyName: 'Survey Name is required' });
      return;
    }
    if (!formData.surveyDescription || !formData.surveyDescription.trim()) {
      setSubmitError('Survey Description is required');
      setErrors({ surveyDescription: 'Survey Description is required' });
      return;
    }
    if (!formData.availableMediums || formData.availableMediums.length === 0) {
      setSubmitError('At least one language must be selected');
      setErrors({ availableMediums: 'At least one language must be selected' });
      return;
    }

    // Run full validation
    if (!validateSurvey(formData)) {
      setSubmitError('Please fix all validation errors before submitting');
      return;
    }

    try {
      setLoading(true);
      // Convert availableMediums array to comma-separated string for backend
      const dataToSend = {
        ...formData,
        availableMediums: Array.isArray(formData.availableMediums) 
          ? formData.availableMediums.join(',') 
          : formData.availableMediums
      };
      
      if (isEdit) {
        await surveyAPI.update(surveyId, dataToSend);
        alert('✓ Survey updated successfully');
        navigate('/');
      } else {
        const response = await surveyAPI.create(dataToSend);
        alert('✓ Survey created successfully! You can now add questions.');
        // Redirect to Question Master after creating survey
        navigate(`/surveys/${response.surveyId}/questions`);
      }
    } catch (err) {
      console.error('Survey submission error:', err);
      
      // Handle validation errors from backend
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        const errorMessages = err.response.data.errors;
        setSubmitError(errorMessages.join(' | '));
        
        // Try to map errors to fields
        const fieldErrors = {};
        errorMessages.forEach(msg => {
          // Extract field name from error message if possible
          const lowerMsg = msg.toLowerCase();
          if (lowerMsg.includes('survey id')) fieldErrors.surveyId = msg;
          else if (lowerMsg.includes('survey name')) fieldErrors.surveyName = msg;
          else if (lowerMsg.includes('survey description')) fieldErrors.surveyDescription = msg;
          else if (lowerMsg.includes('available mediums') || lowerMsg.includes('language')) fieldErrors.availableMediums = msg;
          else if (lowerMsg.includes('launch date')) fieldErrors.launchDate = msg;
          else if (lowerMsg.includes('close date')) fieldErrors.closeDate = msg;
        });
        setErrors(fieldErrors);
      } else if (err.response?.data?.error) {
        setSubmitError(err.response.data.error);
      } else if (err.message) {
        setSubmitError(`Failed to save survey: ${err.message}`);
      } else {
        setSubmitError('Failed to save survey. Please check all fields and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-container">
      <div className="form-header">
        <h2>{isEdit ? 'Edit Survey' : 'Create New Survey'}</h2>
        <button 
          className="btn btn-secondary"
          onClick={() => navigate('/')}
        >
          Back to Surveys
        </button>
      </div>

      {submitError && (
        <div className="error-message">
          <strong>Error:</strong> {submitError}
        </div>
      )}
      
      {Object.keys(errors).length > 0 && (
        <div className="error-message">
          <strong>Please fix the following errors:</strong>
          <ul style={{ margin: '0.5rem 0 0 1.5rem' }}>
            {Object.entries(errors).map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="survey-form">
        <div className="form-section">
          <h3>Basic Information</h3>
          
          <div className="form-group">
            <label htmlFor="surveyId">
              Survey ID <span className="required">*</span>
            </label>
            <input
              type="text"
              id="surveyId"
              name="surveyId"
              value={formData.surveyId}
              onChange={handleChange}
              disabled={isEdit}
              placeholder="e.g., UK_SEC_INF_01"
              className={errors.surveyId ? 'error' : ''}
            />
            {errors.surveyId && <span className="error-text">{errors.surveyId}</span>}
            <small>Format: [Name][Number] e.g., SEC_INF_01</small>
          </div>

          <div className="form-group">
            <label htmlFor="surveyName">
              Survey Name <span className="required">*</span>
            </label>
            <input
              type="text"
              id="surveyName"
              name="surveyName"
              value={formData.surveyName}
              onChange={handleChange}
              placeholder="e.g., Secondary Schools Infrastructure Survey"
              className={errors.surveyName ? 'error' : ''}
              maxLength="99"
            />
            {errors.surveyName && <span className="error-text">{errors.surveyName}</span>}
            <small>{formData.surveyName.length}/99 characters</small>
          </div>

          <div className="form-group">
            <label htmlFor="surveyDescription">
              Survey Description <span className="required">*</span>
            </label>
            <textarea
              id="surveyDescription"
              name="surveyDescription"
              value={formData.surveyDescription}
              onChange={handleChange}
              rows="4"
              placeholder="Describe the purpose of this survey"
              className={errors.surveyDescription ? 'error' : ''}
              maxLength="256"
            />
            {errors.surveyDescription && <span className="error-text">{errors.surveyDescription}</span>}
            <small>{formData.surveyDescription.length}/256 characters</small>
          </div>

          <div className="form-group">
            <label htmlFor="availableMediums">
              Available Mediums (Languages) <span className="required">*</span>
            </label>
            <div className="medium-select-wrapper" ref={mediumDropdownRef}>
              <input
                type="text"
                placeholder="Click to select languages..."
                value=""
                onClick={() => setShowMediumDropdown(!showMediumDropdown)}
                readOnly
                className={errors.availableMediums ? 'error' : ''}
                style={{ cursor: 'pointer' }}
              />
              {showMediumDropdown && (
                <div className="medium-dropdown">
                  {AVAILABLE_MEDIUMS.map(medium => (
                    <div
                      key={medium}
                      className={`medium-option ${formData.availableMediums.includes(medium) ? 'selected' : ''}`}
                      onClick={() => toggleMedium(medium)}
                    >
                      {medium}
                      {formData.availableMediums.includes(medium) && ' ✓'}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errors.availableMediums && <span className="error-text">{errors.availableMediums}</span>}
            <div className="medium-tags-container">
              {formData.availableMediums && formData.availableMediums.map(medium => (
                <span key={medium} className="medium-tag">
                  {medium}
                  <button 
                    type="button"
                    onClick={() => removeMedium(medium)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <small>Select one or more languages for the survey</small>
          </div>

          <div className="form-group">
            <label htmlFor="hierarchicalAccessLevel">Hierarchical Access Level</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                value={hierarchyInput}
                onChange={(e) => setHierarchyInput(e.target.value)}
                placeholder="Enter numeric value (e.g., 12)"
                style={{ flex: 1 }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddHierarchyLevel();
                  }
                }}
              />
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={handleAddHierarchyLevel}
              >
                Add Level
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {hierarchyLevels.map(level => (
                <span key={level} style={{ 
                  padding: '0.25rem 0.75rem', 
                  backgroundColor: '#e0e0e0', 
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {level}
                  <button 
                    type="button"
                    onClick={() => handleRemoveHierarchyLevel(level)}
                    style={{ 
                      border: 'none', 
                      background: 'none', 
                      cursor: 'pointer',
                      fontSize: '1.2rem',
                      lineHeight: '1'
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <small>Numeric values only, no duplicates allowed</small>
          </div>
        </div>

        <div className="form-section">
          <h3>Settings</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="public">Public</label>
              <select
                id="public"
                name="public"
                value={formData.public}
                onChange={handleChange}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="inSchool">In School</label>
              <select
                id="inSchool"
                name="inSchool"
                value={formData.inSchool}
                onChange={handleChange}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="acceptMultipleEntries">Accept Multiple Entries</label>
              <select
                id="acceptMultipleEntries"
                name="acceptMultipleEntries"
                value={formData.acceptMultipleEntries}
                onChange={handleChange}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="isActive">Is Active?</label>
              <select
                id="isActive"
                name="isActive"
                value={formData.isActive}
                onChange={handleChange}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="testSurvey">Test Survey</label>
              <select
                id="testSurvey"
                name="testSurvey"
                value={formData.testSurvey}
                onChange={handleChange}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="mode">Mode</label>
              <select
                id="mode"
                name="mode"
                value={formData.mode}
                onChange={handleChange}
              >
                <option value="None">None</option>
                <option value="New Data">New Data</option>
                <option value="Correction">Correction</option>
                <option value="Delete Data">Delete Data</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Dates</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="launchDate">Launch Date (Start Date)</label>
              <DatePicker
                selected={parseDate(formData.launchDate)}
                onChange={(date) => handleDateChange(date, 'launchDate')}
                showTimeSelect
                timeFormat="HH:mm:ss"
                timeIntervals={15}
                dateFormat="dd/MM/yyyy HH:mm:ss"
                placeholderText="Select launch date and time"
                className={errors.launchDate ? 'error' : ''}
                isClearable
              />
              {errors.launchDate && <span className="error-text">{errors.launchDate}</span>}
              <small>Format: DD/MM/YYYY HH:MM:SS (e.g., 28/01/2025 00:00:00)</small>
            </div>

            <div className="form-group">
              <label htmlFor="closeDate">Close Date (End Date)</label>
              <DatePicker
                selected={parseDate(formData.closeDate)}
                onChange={(date) => handleDateChange(date, 'closeDate')}
                showTimeSelect
                timeFormat="HH:mm:ss"
                timeIntervals={15}
                dateFormat="dd/MM/yyyy HH:mm:ss"
                placeholderText="Select close date and time"
                className={errors.closeDate ? 'error' : ''}
                minDate={parseDate(formData.launchDate)}
                isClearable
              />
              {errors.closeDate && <span className="error-text">{errors.closeDate}</span>}
              <small>Format: DD/MM/YYYY HH:MM:SS (must be ≥ Launch Date)</small>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Features</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="visibleOnReportBot">Visible on Report Bot</label>
              <select
                id="visibleOnReportBot"
                name="visibleOnReportBot"
                value={formData.visibleOnReportBot}
                onChange={handleChange}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="downloadResponse">Download Response</label>
              <select
                id="downloadResponse"
                name="downloadResponse"
                value={formData.downloadResponse}
                onChange={handleChange}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="geoFencing">Geo Fencing</label>
              <select
                id="geoFencing"
                name="geoFencing"
                value={formData.geoFencing}
                onChange={handleChange}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="geoTagging">Geo Tagging</label>
              <select
                id="geoTagging"
                name="geoTagging"
                value={formData.geoTagging}
                onChange={handleChange}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button 
            type="button" 
            className="btn btn-secondary"
            onClick={() => navigate('/')}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={
              loading || 
              !formData.surveyId || 
              !formData.surveyName || 
              !formData.surveyDescription ||
              !formData.availableMediums || 
              formData.availableMediums.length === 0 ||
              Object.keys(errors).length > 0
            }
          >
            {loading ? 'Saving...' : (isEdit ? 'Update Survey' : 'Create Survey')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SurveyForm;
