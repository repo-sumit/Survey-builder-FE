import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { questionAPI, surveyAPI } from '../services/api';
import { useValidation } from '../hooks/useValidation';
import { questionTypes, textInputTypes, questionMediaTypes, yesNoOptions, getFieldsForQuestionType } from '../schemas/questionTypeSchema';
import TranslationPanel from './TranslationPanel';

const QuestionForm = () => {
  const navigate = useNavigate();
  const { surveyId, questionId } = useParams();
  const isEdit = Boolean(questionId);
  const { errors, validateQuestion, setErrors } = useValidation();

  const [survey, setSurvey] = useState(null);
  const [existingQuestions, setExistingQuestions] = useState([]);
  const [formData, setFormData] = useState({
    questionId: '',
    questionType: '',
    isDynamic: 'No',
    questionDescriptionOptional: '',
    maxValue: '',
    minValue: '',
    isMandatory: 'Yes',
    sourceQuestion: '',
    textInputType: 'None',
    textLimitCharacters: '',
    mode: 'New Data',
    questionMediaLink: '',
    questionMediaType: 'None',
    correctAnswerOptional: '',
    childrenQuestions: '',
    outcomeDescription: '',
    translations: {} // New field for multi-language support
  });

  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [fieldConfig, setFieldConfig] = useState({});
  const [surveyLanguages, setSurveyLanguages] = useState(['English']);

  useEffect(() => {
    loadSurvey();
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, questionId]);

  useEffect(() => {
    if (formData.questionType) {
      const config = getFieldsForQuestionType(formData.questionType);
      setFieldConfig(config);
      
      // Auto-set values based on question type constraints
      const updates = {};
      if (config.textInputTypeValue) {
        updates.textInputType = config.textInputTypeValue;
      }
      if (config.questionMediaTypeValue) {
        updates.questionMediaType = config.questionMediaTypeValue;
      }
      if (config.isDynamic) {
        updates.isDynamic = config.isDynamic;
      }
      
      if (Object.keys(updates).length > 0) {
        setFormData(prev => ({ ...prev, ...updates }));
      }
    }
  }, [formData.questionType]);
  
  // Clear questionMediaLink when questionMediaType is None
  useEffect(() => {
    if (formData.questionMediaType === 'None' && formData.questionMediaLink) {
      setFormData(prev => ({ ...prev, questionMediaLink: '' }));
    }
  }, [formData.questionMediaType, formData.questionMediaLink]);

  const loadSurvey = async () => {
    try {
      const data = await surveyAPI.getById(surveyId);
      setSurvey(data);
      
      // Parse available languages from survey
      const languages = typeof data.availableMediums === 'string' 
        ? data.availableMediums.split(',').map(l => l.trim()).filter(l => l)
        : (data.availableMediums || ['English']);
      const orderedLanguages = languages.includes('English')
        ? ['English', ...languages.filter(lang => lang !== 'English')]
        : languages;
      
      setSurveyLanguages(orderedLanguages);
      
      // Initialize translations for all languages if creating new question
      if (!isEdit) {
        const initialTranslations = {};
        orderedLanguages.forEach(lang => {
          initialTranslations[lang] = {
            questionDescription: '',
            options: [],
            tableHeaderValue: '',
            tableQuestionValue: ''
          };
        });
        setFormData(prev => ({ ...prev, translations: initialTranslations }));
      }
    } catch (err) {
      alert('Failed to load survey');
      navigate('/');
    }
  };

  const loadQuestions = async () => {
    try {
      const questions = await questionAPI.getAll(surveyId);
      setExistingQuestions(questions);
      if (!isEdit) {
        return;
      }
      const question = questions.find(q => q.questionId === questionId);
      if (question) {
        // If question doesn't have translations, create them from old format
        if (!question.translations) {
          const languages = surveyLanguages.length > 0 ? surveyLanguages : ['English'];
          const translations = {};
          
          languages.forEach(lang => {
            translations[lang] = {
              questionDescription: question.questionDescription || '',
              options: question.options || [],
              tableHeaderValue: question.tableHeaderValue || '',
              tableQuestionValue: question.tableQuestionValue || ''
            };
          });
          
          question.translations = translations;
        }
        
        setFormData(question);
      }
    } catch (err) {
      setExistingQuestions([]);
      if (isEdit) {
        alert('Failed to load question');
        navigate(`/surveys/${surveyId}/questions`);
      }
    }
  };

  const normalizeQuestionId = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return '';
    }
    if (/^q/i.test(trimmed)) {
      return `Q${trimmed.slice(1)}`;
    }
    if (/^\d+(\.\d+)*$/.test(trimmed)) {
      return `Q${trimmed}`;
    }
    return trimmed;
  };

  const getParentQuestionId = (value) => {
    const normalized = normalizeQuestionId(value);
    if (!normalized.includes('.')) {
      return '';
    }
    return normalized.split('.').slice(0, -1).join('.');
  };

  const normalizeChildList = (value) => {
    if (!value) {
      return '';
    }
    const parts = value
      .split(',')
      .map(part => normalizeQuestionId(part))
      .filter(Boolean);
    return parts.join(', ');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const normalizedValue = (name === 'questionId' || name === 'sourceQuestion')
        ? normalizeQuestionId(value)
        : value;
      const next = {
        ...prev,
        [name]: normalizedValue
      };

      if (name === 'questionId' && normalizedValue.includes('.')) {
        const parentId = getParentQuestionId(normalizedValue);
        const previousParent = prev.questionId?.includes('.')
          ? prev.questionId.split('.').slice(0, -1).join('.')
          : '';
        if (!prev.sourceQuestion || prev.sourceQuestion === previousParent) {
          next.sourceQuestion = parentId;
        }
      }

      return next;
    });
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleTranslationsChange = (updatedTranslations) => {
    setFormData(prev => ({
      ...prev,
      translations: updatedTranslations
    }));
  };

  const buildQuestionPayload = () => {
    const primaryLanguage = surveyLanguages.includes('English')
      ? 'English'
      : (surveyLanguages[0] || 'English');
    const primaryTranslation = formData.translations?.[primaryLanguage] || {};
    const normalizedQuestionId = normalizeQuestionId(formData.questionId);
    const normalizedSourceQuestion = normalizeQuestionId(formData.sourceQuestion);
    const derivedParent = normalizedQuestionId.includes('.') ? getParentQuestionId(normalizedQuestionId) : '';
    const resolvedSourceQuestion = normalizedSourceQuestion || derivedParent;
    const normalizeOptions = (options = []) => options.map(option => {
      if (!option || typeof option !== 'object') {
        return option;
      }
      return {
        ...option,
        children: normalizeChildList(option.children || '')
      };
    });
    const normalizedTranslations = {};
    Object.entries(formData.translations || {}).forEach(([lang, translation]) => {
      normalizedTranslations[lang] = {
        ...translation,
        options: normalizeOptions(translation.options || [])
      };
    });

    // Map translations back to legacy fields for validation and backend compatibility.
    return {
      ...formData,
      questionId: normalizedQuestionId,
      sourceQuestion: resolvedSourceQuestion,
      translations: normalizedTranslations,
      questionDescription: primaryTranslation.questionDescription || '',
      options: normalizeOptions(primaryTranslation.options || []),
      tableHeaderValue: primaryTranslation.tableHeaderValue || '',
      tableQuestionValue: primaryTranslation.tableQuestionValue || '',
      medium: primaryLanguage
    };
  };

  const getOptionsForQuestion = (question, fallbackLanguage) => {
    if (Array.isArray(question.options) && question.options.length > 0) {
      return question.options;
    }
    const translations = question.translations || {};
    if (fallbackLanguage && translations[fallbackLanguage]?.options) {
      return translations[fallbackLanguage].options;
    }
    const firstLanguage = Object.keys(translations)[0];
    return translations[firstLanguage]?.options || [];
  };

  const getChildMappingConflicts = (questions, fallbackLanguage) => {
    const seen = new Map();
    const conflicts = new Set();

    questions.forEach(question => {
      const options = getOptionsForQuestion(question, fallbackLanguage);
      options.forEach((option, optionIndex) => {
        const children = normalizeChildList(option?.children || '')
          .split(',')
          .map(child => child.trim())
          .filter(Boolean);
        const uniqueChildren = new Set(children);
        uniqueChildren.forEach(childId => {
          const existing = seen.get(childId);
          if (existing && (existing.questionId !== question.questionId || existing.optionIndex !== optionIndex)) {
            conflicts.add(childId);
          } else {
            seen.set(childId, { questionId: question.questionId, optionIndex });
          }
        });
      });
    });

    return Array.from(conflicts);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setErrors({});

    // Validate required basic fields
    if (!formData.questionId || !formData.questionId.trim()) {
      setSubmitError('Question ID is required');
      setErrors({ questionId: 'Question ID is required' });
      return;
    }
    if (!formData.questionType || formData.questionType === '') {
      setSubmitError('Question Type is required');
      setErrors({ questionType: 'Question Type is required' });
      return;
    }

    // Validate that all languages have required translations
    let hasAllTranslations = true;
    let missingLanguages = [];
    let translationErrors = [];
    
    surveyLanguages.forEach(lang => {
      const translation = formData.translations[lang];
      if (!translation || !translation.questionDescription || translation.questionDescription.trim() === '') {
        hasAllTranslations = false;
        missingLanguages.push(lang);
        translationErrors.push(`${lang}: Question Description is required`);
      }
      
      if (fieldConfig.showTableFields) {
        if (!translation?.tableHeaderValue || translation.tableHeaderValue.trim() === '') {
          hasAllTranslations = false;
          if (!missingLanguages.includes(lang)) {
            missingLanguages.push(lang);
          }
          translationErrors.push(`${lang}: Table Header Value is required`);
        }
        if (!translation?.tableQuestionValue || translation.tableQuestionValue.trim() === '') {
          hasAllTranslations = false;
          if (!missingLanguages.includes(lang)) {
            missingLanguages.push(lang);
          }
          translationErrors.push(`${lang}: Table Question Value is required`);
        }
      }
      
      if (fieldConfig.showOptions) {
        if (!translation?.options || translation.options.length < 2) {
          hasAllTranslations = false;
          if (!missingLanguages.includes(lang)) {
            missingLanguages.push(lang);
          }
          translationErrors.push(`${lang}: At least 2 options are required`);
        }
      }
    });
    
    if (!hasAllTranslations) {
      const errorMsg = `Missing required translations:\n${translationErrors.join('\n')}`;
      setSubmitError(errorMsg);
      return;
    }

    const payload = buildQuestionPayload();

    const parentId = payload.questionId.includes('.') ? (payload.sourceQuestion || getParentQuestionId(payload.questionId)) : '';
    if (payload.questionId.includes('.')) {
      if (!parentId) {
        setSubmitError('Child questions must have a parent question.');
        setErrors({ sourceQuestion: 'Source Question is required for child questions' });
        return;
      }
      const parentQuestion = existingQuestions.find(q => q.surveyId === surveyId && q.questionId === parentId);
      if (parentQuestion && parentQuestion.questionType !== 'Multiple Choice Single Select') {
        setSubmitError('Only Multiple Choice Single Select questions can have child questions. Change the Question ID or parent.');
        setErrors({ questionId: 'Child questions can only belong to Multiple Choice Single Select questions.' });
        return;
      }
    }

    const validationQuestions = [
      ...existingQuestions.filter(q => q.surveyId === surveyId && q.questionId !== payload.questionId),
      payload
    ];
    const conflictChildren = getChildMappingConflicts(validationQuestions, payload.medium);
    if (conflictChildren.length > 0) {
      setSubmitError(`Child question IDs cannot be mapped to multiple options/questions: ${conflictChildren.join(', ')}`);
      setErrors({ options: 'Child question IDs must be unique across all options.' });
      return;
    }

    // Run full validation
    if (!validateQuestion(payload, payload.questionType)) {
      setSubmitError('Please fix all validation errors before submitting');
      return;
    }

    try {
      setLoading(true);
      if (isEdit) {
        await questionAPI.update(surveyId, questionId, payload);
        alert('✓ Question updated successfully');
      } else {
        await questionAPI.create(surveyId, payload);
        alert('✓ Question added successfully! You can add more questions or preview the survey.');
      }
      navigate(`/surveys/${surveyId}/questions`);
    } catch (err) {
      console.error('Question submission error:', err);
      
      // Handle validation errors from backend
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        const errorMessages = err.response.data.errors;
        setSubmitError(errorMessages.join('\n'));
        
        // Try to map errors to fields
        const fieldErrors = {};
        errorMessages.forEach(msg => {
          const lowerMsg = msg.toLowerCase();
          if (lowerMsg.includes('question id')) fieldErrors.questionId = msg;
          else if (lowerMsg.includes('question type')) fieldErrors.questionType = msg;
          else if (lowerMsg.includes('question description')) fieldErrors.questionDescription = msg;
          else if (lowerMsg.includes('option')) fieldErrors.options = msg;
          else if (lowerMsg.includes('table header')) fieldErrors.tableHeaderValue = msg;
          else if (lowerMsg.includes('table question')) fieldErrors.tableQuestionValue = msg;
        });
        setErrors(fieldErrors);
      } else if (err.response?.data?.error) {
        setSubmitError(err.response.data.error);
      } else if (err.message) {
        setSubmitError(`Failed to save question: ${err.message}`);
      } else {
        setSubmitError('Failed to save question. Please check all fields and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!survey) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="form-container">
      <div className="form-header">
        <h2>{isEdit ? 'Edit Question' : 'Add New Question'}</h2>
        <button 
          className="btn btn-secondary"
          onClick={() => navigate(`/surveys/${surveyId}/questions`)}
        >
          Back to Questions
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

      <form onSubmit={handleSubmit} className="question-form">
        <div className="form-section">
          <h3>Basic Information</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="questionId">
                Question ID <span className="required">*</span>
              </label>
              <input
                type="text"
                id="questionId"
                name="questionId"
                value={formData.questionId}
                onChange={handleChange}
                disabled={isEdit}
                placeholder="e.g., 1, 1.1, 2"
                className={errors.questionId ? 'error' : ''}
              />
              {errors.questionId && <span className="error-text">{errors.questionId}</span>}
              <small>Format: 1, 2, or 1.1 for child questions (saved as Q1, Q1.1)</small>
            </div>

            <div className="form-group">
              <label htmlFor="questionType">
                Question Type <span className="required">*</span>
              </label>
              <select
                id="questionType"
                name="questionType"
                value={formData.questionType}
                onChange={handleChange}
                className={errors.questionType ? 'error' : ''}
              >
                <option value="">Select Question Type</option>
                {questionTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              {errors.questionType && <span className="error-text">{errors.questionType}</span>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="questionDescriptionOptional">Question Description Optional</label>
            <input
              type="text"
              id="questionDescriptionOptional"
              name="questionDescriptionOptional"
              value={formData.questionDescriptionOptional}
              onChange={handleChange}
              maxLength="256"
              placeholder="Optional description (max 256 characters)"
            />
          </div>
        </div>

        {/* Parent/Child Question Settings */}
        <div className="form-section">
          <h3>Question Relationship</h3>
          
          <div className="form-group">
            <label htmlFor="sourceQuestion">Source Question (Parent)</label>
            <input
              type="text"
              id="sourceQuestion"
              name="sourceQuestion"
              value={formData.sourceQuestion}
              onChange={handleChange}
              placeholder="e.g., 1 (for child questions)"
            />
            <small>Only required for child questions (e.g., 1.1, 1.2)</small>
          </div>
        </div>

        {/* Multi-Language Translations */}
        {formData.questionType && surveyLanguages.length > 0 && (
          <div className="form-section">
            <h3>Translations ({surveyLanguages.length} {surveyLanguages.length === 1 ? 'language' : 'languages'})</h3>
            <TranslationPanel
              languages={surveyLanguages}
              translations={formData.translations}
              onChange={handleTranslationsChange}
              questionType={formData.questionType}
              fieldConfig={fieldConfig}
            />
          </div>
        )}

        {/* Settings */}
        <div className="form-section">
          <h3>Settings</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="isMandatory">Is Mandatory</label>
              <select
                id="isMandatory"
                name="isMandatory"
                value={formData.isMandatory}
                onChange={handleChange}
              >
                {yesNoOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="isDynamic">Is Dynamic</label>
              <select
                id="isDynamic"
                name="isDynamic"
                value={formData.isDynamic}
                onChange={handleChange}
                disabled={fieldConfig.isDynamic !== undefined}
              >
                {yesNoOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {fieldConfig.isDynamic && <small>Auto-set based on question type</small>}
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

          {fieldConfig.showTextInputType && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="textInputType">Text Input Type</label>
                <select
                  id="textInputType"
                  name="textInputType"
                  value={formData.textInputType}
                  onChange={handleChange}
                  disabled={fieldConfig.textInputTypeValue}
                >
                  {textInputTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {fieldConfig.showTextLimit && (
                <div className="form-group">
                  <label htmlFor="textLimitCharacters">Text Limit (Characters)</label>
                  <input
                    type="number"
                    id="textLimitCharacters"
                    name="textLimitCharacters"
                    value={formData.textLimitCharacters}
                    onChange={handleChange}
                    placeholder="Default: 1024"
                  />
                </div>
              )}
            </div>
          )}

          {fieldConfig.showMaxMin && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="minValue">Min Value</label>
                <input
                  type="text"
                  id="minValue"
                  name="minValue"
                  value={formData.minValue}
                  onChange={handleChange}
                  placeholder="Minimum value"
                />
              </div>
              <div className="form-group">
                <label htmlFor="maxValue">Max Value</label>
                <input
                  type="text"
                  id="maxValue"
                  name="maxValue"
                  value={formData.maxValue}
                  onChange={handleChange}
                  placeholder="Maximum value"
                />
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="questionMediaType">Question Media Type</label>
              <select
                id="questionMediaType"
                name="questionMediaType"
                value={formData.questionMediaType}
                onChange={handleChange}
                disabled={fieldConfig.questionMediaTypeValue}
              >
                {questionMediaTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="questionMediaLink">Question Media Link</label>
              <input
                type="text"
                id="questionMediaLink"
                name="questionMediaLink"
                value={formData.questionMediaLink}
                onChange={handleChange}
                placeholder="URL to media file"
                disabled={formData.questionMediaType === 'None'}
              />
              {formData.questionMediaType === 'None' && (
                <small>Disabled when Media Type is None</small>
              )}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button 
            type="button" 
            className="btn btn-secondary"
            onClick={() => navigate(`/surveys/${surveyId}/questions`)}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Saving...' : (isEdit ? 'Update Question' : 'Add Question')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default QuestionForm;
