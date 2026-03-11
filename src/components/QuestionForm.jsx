import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { questionAPI, surveyAPI, translateAPI } from '../services/api';
import { useValidation } from '../hooks/useValidation';
import { questionTypes, textInputTypes, questionMediaTypes, yesNoOptions, getFieldsForQuestionType } from '../schemas/questionTypeSchema';
import { getNativeScript, getISOCode } from '../schemas/languageMappings';

const QuestionForm = () => {
  const navigate = useNavigate();
  const { surveyId, questionId } = useParams();
  const isEdit = Boolean(questionId);
  const { errors, validateQuestion, setErrors } = useValidation();

  const [survey, setSurvey] = useState(null);
  const [surveyLanguages, setSurveyLanguages] = useState([]);
  const [existingQuestions, setExistingQuestions] = useState([]);
  const [loadError, setLoadError] = useState(null);

  // English / primary content lives in formData
  const [formData, setFormData] = useState({
    questionId: '',
    questionType: '',
    questionDescription: '',
    isDynamic: 'No',
    questionDescriptionOptional: '',
    tableHeaderValue: '',
    tableQuestionValue: '',
    options: [],
    maxValue: '',
    minValue: '',
    isMandatory: 'Yes',
    sourceQuestion: '',
    medium: 'English',
    textInputType: 'None',
    textLimitCharacters: '',
    mode: 'New Data',
    questionMediaLink: '',
    questionMediaType: 'None',
    correctAnswerOptional: '',
    childrenQuestions: '',
    outcomeDescription: ''
  });

  // Per-language translated content (for non-English languages only)
  // Shape: { Hindi: { questionDescription, tableHeaderValue, tableQuestionValue, options: [{text}] }, ... }
  const [langTranslations, setLangTranslations] = useState({});
  const [translating, setTranslating] = useState({});     // { Hindi: true/false }
  const [translateErrors, setTranslateErrors] = useState({}); // { Hindi: 'error msg' }

  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [fieldConfig, setFieldConfig] = useState({});

  // ─── Load data ────────────────────────────────────────────────────────────

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, questionId]);

  useEffect(() => {
    if (!formData.questionType) return;
    const config = getFieldsForQuestionType(formData.questionType);
    setFieldConfig(config);
    const updates = {};
    if (config.textInputTypeValue) updates.textInputType = config.textInputTypeValue;
    if (config.questionMediaTypeValue) updates.questionMediaType = config.questionMediaTypeValue;
    if (config.isDynamic !== undefined) updates.isDynamic = config.isDynamic;
    if (Object.keys(updates).length > 0) {
      setFormData(prev => ({ ...prev, ...updates }));
    }
  }, [formData.questionType]);

  useEffect(() => {
    if (formData.questionMediaType === 'None' && formData.questionMediaLink) {
      setFormData(prev => ({ ...prev, questionMediaLink: '' }));
    }
  }, [formData.questionMediaType, formData.questionMediaLink]);

  const parseAvailableMediums = (surveyData) => {
    if (!surveyData) return [];
    if (Array.isArray(surveyData.availableMediums)) {
      return surveyData.availableMediums.map(l => String(l).trim()).filter(Boolean);
    }
    if (typeof surveyData.availableMediums === 'string') {
      return surveyData.availableMediums.split(',').map(l => l.trim()).filter(Boolean);
    }
    return [];
  };

  const buildEmptyLangSlots = (languages, englishOptCount, existingTranslations = {}) => {
    const result = {};
    languages.filter(l => l !== 'English').forEach(lang => {
      const ex = existingTranslations[lang] || {};
      result[lang] = {
        questionDescription: ex.questionDescription || '',
        tableHeaderValue: ex.tableHeaderValue || '',
        tableQuestionValue: ex.tableQuestionValue || '',
        options: Array.from({ length: englishOptCount }, (_, i) => ({
          text: ex.options?.[i]?.text || ''
        }))
      };
    });
    return result;
  };

  const loadAll = async () => {
    setLoadError(null);
    try {
      const surveyData = await surveyAPI.getById(surveyId);
      setSurvey(surveyData);

      const langs = parseAvailableMediums(surveyData);
      const effectiveLangs = langs.length > 0 ? langs : ['English'];
      setSurveyLanguages(effectiveLangs);

      const questions = await questionAPI.getAll(surveyId);
      setExistingQuestions(questions);

      if (!isEdit) {
        setFormData(prev => ({ ...prev, medium: effectiveLangs[0] || 'English' }));
        setLangTranslations(buildEmptyLangSlots(effectiveLangs, 0, {}));
        return;
      }

      const question = questions.find(q => q.questionId === questionId);
      if (!question) {
        setLoadError('Question not found. It may have been deleted.');
        return;
      }

      // Resolve English source — prefer translations.English, fall back to top-level fields
      const storedTranslations = question.translations || {};
      const englishSrc = storedTranslations.English || {
        questionDescription: question.questionDescription || '',
        options: question.options || [],
        tableHeaderValue: question.tableHeaderValue || '',
        tableQuestionValue: question.tableQuestionValue || ''
      };
      const englishOptions = Array.isArray(englishSrc.options) && englishSrc.options.length > 0
        ? englishSrc.options
        : (question.options || []);

      setFormData(prev => ({
        ...prev,
        ...question,
        questionDescription: englishSrc.questionDescription || question.questionDescription || '',
        options: englishOptions,
        tableHeaderValue: englishSrc.tableHeaderValue || question.tableHeaderValue || '',
        tableQuestionValue: englishSrc.tableQuestionValue || question.tableQuestionValue || '',
        medium: question.medium || effectiveLangs[0] || 'English'
      }));

      setLangTranslations(buildEmptyLangSlots(effectiveLangs, englishOptions.length, storedTranslations));
    } catch (err) {
      setLoadError('Failed to load data. Please go back and try again.');
    }
  };

  const nonEnglishLanguages = surveyLanguages.filter(l => l !== 'English');

  // ─── ID helpers ───────────────────────────────────────────────────────────

  const normalizeQuestionId = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (/^q/i.test(trimmed)) return `Q${trimmed.slice(1)}`;
    if (/^\d+(\.\d+)*$/.test(trimmed)) return `Q${trimmed}`;
    return trimmed;
  };

  const getParentQuestionId = (value) => {
    const normalized = normalizeQuestionId(value);
    if (!normalized.includes('.')) return '';
    return normalized.split('.').slice(0, -1).join('.');
  };

  const normalizeChildList = (value) => {
    if (!value) return '';
    return value.split(',').map(p => normalizeQuestionId(p)).filter(Boolean).join(', ');
  };

  // ─── English field handlers ────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const normalized = (name === 'questionId' || name === 'sourceQuestion')
        ? normalizeQuestionId(value)
        : value;
      const next = { ...prev, [name]: normalized };
      if (name === 'questionId' && normalized.includes('.')) {
        const parentId = getParentQuestionId(normalized);
        const prevParent = prev.questionId?.includes('.')
          ? prev.questionId.split('.').slice(0, -1).join('.')
          : '';
        if (!prev.sourceQuestion || prev.sourceQuestion === prevParent) {
          next.sourceQuestion = parentId;
        }
      }
      return next;
    });
    if (errors[name]) {
      setErrors(prev => { const e = { ...prev }; delete e[name]; return e; });
    }
  };

  const handleOptionChange = (index, field, value) => {
    setFormData(prev => {
      const options = [...(prev.options || [])];
      const current = options[index] || { text: '', textInEnglish: '', children: '' };
      const updated = { ...current, [field]: value };
      if (field === 'text' && (!current.textInEnglish || current.textInEnglish === current.text)) {
        updated.textInEnglish = value;
      }
      options[index] = updated;
      return { ...prev, options };
    });
    if (errors.options) {
      setErrors(prev => { const e = { ...prev }; delete e.options; return e; });
    }
  };

  const addOption = () => {
    const maxOptions = fieldConfig?.maxOptions || 20;
    if ((formData.options || []).length >= maxOptions) {
      setErrors(prev => ({ ...prev, options: `Maximum ${maxOptions} options allowed` }));
      return;
    }
    setFormData(prev => ({
      ...prev,
      options: [...(prev.options || []), { text: '', textInEnglish: '', children: '' }]
    }));
    // Add matching empty slot in every language
    setLangTranslations(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(lang => {
        updated[lang] = { ...updated[lang], options: [...(updated[lang].options || []), { text: '' }] };
      });
      return updated;
    });
  };

  const removeOption = (index) => {
    setFormData(prev => ({ ...prev, options: (prev.options || []).filter((_, i) => i !== index) }));
    setLangTranslations(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(lang => {
        updated[lang] = { ...updated[lang], options: (updated[lang].options || []).filter((_, i) => i !== index) };
      });
      return updated;
    });
  };

  // ─── Translation handlers ─────────────────────────────────────────────────

  const handleTranslationChange = (lang, field, value) => {
    setLangTranslations(prev => ({
      ...prev,
      [lang]: { ...prev[lang], [field]: value }
    }));
  };

  const handleTranslationOptionChange = (lang, index, value) => {
    setLangTranslations(prev => {
      const langData = { ...prev[lang] };
      const options = [...(langData.options || [])];
      options[index] = { ...options[index], text: value };
      return { ...prev, [lang]: { ...langData, options } };
    });
  };

  const translateAll = async (lang) => {
    const isoCode = getISOCode(lang);
    if (!isoCode) {
      setTranslateErrors(prev => ({
        ...prev,
        [lang]: `Auto-translation is not available for ${lang}. Please enter the translation manually.`
      }));
      return;
    }
    if (!formData.questionDescription?.trim()) {
      setTranslateErrors(prev => ({
        ...prev,
        [lang]: 'Please enter the English question description before translating.'
      }));
      return;
    }

    setTranslating(prev => ({ ...prev, [lang]: true }));
    setTranslateErrors(prev => ({ ...prev, [lang]: null }));

    try {
      const updates = { ...(langTranslations[lang] || {}) };

      updates.questionDescription = await translateAPI.translate(formData.questionDescription, isoCode);

      if (fieldConfig.showTableFields) {
        if (formData.tableHeaderValue?.trim()) {
          updates.tableHeaderValue = await translateAPI.translate(formData.tableHeaderValue, isoCode);
        }
        if (formData.tableQuestionValue?.trim()) {
          // Preserve the a:/b: prefix format — translate only the text after the colon
          const lines = formData.tableQuestionValue.split('\n');
          const translatedLines = await Promise.all(lines.map(async line => {
            const colonIdx = line.indexOf(':');
            if (colonIdx > -1) {
              const prefix = line.substring(0, colonIdx + 1);
              const text = line.substring(colonIdx + 1).trim();
              if (text) {
                const translated = await translateAPI.translate(text, isoCode);
                return `${prefix}${translated}`;
              }
            }
            return line;
          }));
          updates.tableQuestionValue = translatedLines.join('\n');
        }
      }

      if (fieldConfig.showOptions && formData.options?.length > 0) {
        const translatedOptions = await Promise.all(
          formData.options.map(async (opt, i) => {
            const text = opt.text?.trim();
            if (!text) return langTranslations[lang]?.options?.[i] || { text: '' };
            const translated = await translateAPI.translate(text, isoCode);
            return { text: translated };
          })
        );
        updates.options = translatedOptions;
      }

      setLangTranslations(prev => ({ ...prev, [lang]: updates }));
    } catch (err) {
      const msg = err.response?.data?.message || err.message || `Failed to translate to ${lang}`;
      setTranslateErrors(prev => ({ ...prev, [lang]: msg }));
    } finally {
      setTranslating(prev => ({ ...prev, [lang]: false }));
    }
  };

  // ─── Payload builder ──────────────────────────────────────────────────────

  const buildQuestionPayload = () => {
    const normalizedId = normalizeQuestionId(formData.questionId);
    const normalizedSource = normalizeQuestionId(formData.sourceQuestion);
    const derivedParent = normalizedId.includes('.') ? getParentQuestionId(normalizedId) : '';
    const resolvedSource = normalizedSource || derivedParent;

    const normalizeOptions = (opts = []) => opts.map(opt => {
      if (!opt || typeof opt !== 'object') return opt;
      return { ...opt, children: normalizeChildList(opt.children || '') };
    });

    const englishOptions = normalizeOptions(formData.options || []);

    // Build translations for all survey languages
    const translations = {
      English: {
        questionDescription: formData.questionDescription || '',
        tableHeaderValue: formData.tableHeaderValue || '',
        tableQuestionValue: formData.tableQuestionValue || '',
        options: englishOptions
      }
    };

    nonEnglishLanguages.forEach(lang => {
      const langData = langTranslations[lang] || {};
      translations[lang] = {
        questionDescription: langData.questionDescription || formData.questionDescription || '',
        tableHeaderValue: langData.tableHeaderValue || formData.tableHeaderValue || '',
        tableQuestionValue: langData.tableQuestionValue || formData.tableQuestionValue || '',
        options: englishOptions.map((opt, i) => ({
          text: langData.options?.[i]?.text || opt.text || '',
          textInEnglish: opt.text || opt.textInEnglish || '',
          children: opt.children || ''
        }))
      };
    });

    return {
      ...formData,
      questionId: normalizedId,
      sourceQuestion: resolvedSource,
      options: englishOptions,
      medium: surveyLanguages[0] || 'English',
      translations
    };
  };

  // ─── Validation helpers ───────────────────────────────────────────────────

  const getOptionsForQuestion = (question) => {
    if (Array.isArray(question.options) && question.options.length > 0) return question.options;
    const t = question.translations || {};
    if (t.English?.options) return t.English.options;
    const first = Object.keys(t)[0];
    return t[first]?.options || [];
  };

  const getChildMappingConflicts = (questions) => {
    const seen = new Map();
    const conflicts = new Set();
    questions.forEach(q => {
      getOptionsForQuestion(q).forEach((opt, optIdx) => {
        normalizeChildList(opt?.children || '').split(',').map(c => c.trim()).filter(Boolean).forEach(childId => {
          const existing = seen.get(childId);
          if (existing && (existing.qId !== q.questionId || existing.optIdx !== optIdx)) {
            conflicts.add(childId);
          } else {
            seen.set(childId, { qId: q.questionId, optIdx });
          }
        });
      });
    });
    return Array.from(conflicts);
  };

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setErrors({});

    if (!formData.questionId?.trim()) {
      setErrors({ questionId: 'Question ID is required' });
      setSubmitError('Question ID is required');
      return;
    }
    if (!formData.questionType) {
      setErrors({ questionType: 'Question Type is required' });
      setSubmitError('Question Type is required');
      return;
    }
    if (fieldConfig.showOptions && (!formData.options || formData.options.length < 2)) {
      setErrors({ options: 'At least 2 options are required' });
      setSubmitError('At least 2 options are required');
      return;
    }

    const payload = buildQuestionPayload();

    if (payload.questionId.includes('.')) {
      const parentId = payload.sourceQuestion || getParentQuestionId(payload.questionId);
      if (!parentId) {
        setErrors({ sourceQuestion: 'Source Question is required for child questions' });
        setSubmitError('Child questions must have a parent question.');
        return;
      }
      const parentQ = existingQuestions.find(q => q.surveyId === surveyId && q.questionId === parentId);
      if (parentQ && parentQ.questionType !== 'Multiple Choice Single Select') {
        setErrors({ questionId: 'Child questions can only belong to Multiple Choice Single Select questions.' });
        setSubmitError('Only Multiple Choice Single Select questions can have child questions. Change the Question ID or parent.');
        return;
      }
    }

    const forConflictCheck = [
      ...existingQuestions.filter(q => q.surveyId === surveyId && q.questionId !== payload.questionId),
      payload
    ];
    const conflictChildren = getChildMappingConflicts(forConflictCheck);
    if (conflictChildren.length > 0) {
      setErrors({ options: 'Child question IDs must be unique across all options.' });
      setSubmitError(`Child question IDs cannot be mapped to multiple options/questions: ${conflictChildren.join(', ')}`);
      return;
    }

    if (!validateQuestion(payload, payload.questionType)) {
      setSubmitError('Please fix all validation errors before submitting');
      return;
    }

    try {
      setLoading(true);
      if (isEdit) {
        await questionAPI.update(surveyId, questionId, payload);
        sessionStorage.setItem('lastEditedQuestionId', questionId);
      } else {
        await questionAPI.create(surveyId, payload);
        sessionStorage.setItem('lastEditedQuestionId', payload.questionId);
      }
      navigate(`/surveys/${surveyId}/questions`);
    } catch (err) {
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        const msgs = err.response.data.errors;
        setSubmitError(msgs.join('\n'));
        const fieldErrors = {};
        msgs.forEach(msg => {
          const lc = msg.toLowerCase();
          if (lc.includes('question id')) fieldErrors.questionId = msg;
          else if (lc.includes('question type')) fieldErrors.questionType = msg;
          else if (lc.includes('question description')) fieldErrors.questionDescription = msg;
          else if (lc.includes('option')) fieldErrors.options = msg;
          else if (lc.includes('table header')) fieldErrors.tableHeaderValue = msg;
          else if (lc.includes('table question')) fieldErrors.tableQuestionValue = msg;
        });
        setErrors(fieldErrors);
      } else if (err.response?.data?.error) {
        setSubmitError(err.response.data.error);
      } else {
        setSubmitError(`Failed to save question: ${err.message || 'Please try again.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="form-container">
        <div className="error-message">{loadError}</div>
        <button className="btn btn-secondary mt-3" onClick={() => navigate(`/surveys/${surveyId}/questions`)}>
          Back to Questions
        </button>
      </div>
    );
  }

  if (!survey) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <div className="form-container">
      <div className="form-header">
        <h2>{isEdit ? 'Edit Question' : 'Add New Question'}</h2>
        <button
          className="btn btn-secondary btn-cta btn-icon-back"
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

        {/* ── BASIC INFORMATION ── */}
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

          {surveyLanguages.length > 0 && (
            <div className="survey-languages-hint">
              <strong>Survey languages:</strong> {surveyLanguages.join(', ')}
              {nonEnglishLanguages.length > 0 && (
                <span className="ms-1">— Enter English content below, then add translations in the <em>Translations</em> section.</span>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="questionDescription">
              Question Description {nonEnglishLanguages.length > 0 ? '(English)' : ''} <span className="required">*</span>
            </label>
            <textarea
              id="questionDescription"
              name="questionDescription"
              value={formData.questionDescription}
              onChange={handleChange}
              rows="3"
              placeholder="Enter question text in English"
              className={errors.questionDescription ? 'error' : ''}
            />
            {errors.questionDescription && <span className="error-text">{errors.questionDescription}</span>}
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

          {fieldConfig.showTableFields && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="tableHeaderValue">
                  Table Header Value {nonEnglishLanguages.length > 0 ? '(English)' : ''} <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="tableHeaderValue"
                  name="tableHeaderValue"
                  value={formData.tableHeaderValue}
                  onChange={handleChange}
                  placeholder="e.g., Header 1, Header 2"
                  className={errors.tableHeaderValue ? 'error' : ''}
                />
                {errors.tableHeaderValue && <span className="error-text">{errors.tableHeaderValue}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="tableQuestionValue">
                  Table Question Value {nonEnglishLanguages.length > 0 ? '(English)' : ''} <span className="required">*</span>
                </label>
                <textarea
                  id="tableQuestionValue"
                  name="tableQuestionValue"
                  value={formData.tableQuestionValue}
                  onChange={handleChange}
                  rows="4"
                  placeholder={'Format:\na:Question 1\nb:Question 2'}
                  className={errors.tableQuestionValue ? 'error' : ''}
                />
                {errors.tableQuestionValue && <span className="error-text">{errors.tableQuestionValue}</span>}
              </div>
            </div>
          )}
        </div>

        {/* ── QUESTION RELATIONSHIP ── */}
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
              className={errors.sourceQuestion ? 'error' : ''}
            />
            {errors.sourceQuestion && <span className="error-text">{errors.sourceQuestion}</span>}
            <small>Only required for child questions (e.g., 1.1, 1.2)</small>
          </div>
        </div>

        {/* ── OPTIONS (English) ── */}
        {fieldConfig.showOptions && (
          <div className="form-section">
            <h3>Options {nonEnglishLanguages.length > 0 ? '(English)' : ''}</h3>
            {errors.options && <span className="error-text">{errors.options}</span>}

            <div className="options-table" style={{ marginTop: '0.625rem' }}>
              <div className="options-table-row options-table-header">
                <div className="options-table-cell options-table-label">
                  Option Text {nonEnglishLanguages.length > 0 ? '(English)' : ''}
                </div>
                {fieldConfig.showOptionChildren && (
                  <div className="options-table-cell options-table-label">Child Questions</div>
                )}
                <div className="options-table-cell options-table-label">Action</div>
              </div>

              {(formData.options || []).map((option, index) => (
                <div className="options-table-row" key={`option-${index}`}>
                  <div className="options-table-cell">
                    <input
                      type="text"
                      value={option?.text || ''}
                      onChange={(e) => handleOptionChange(index, 'text', e.target.value)}
                      placeholder={`Option ${index + 1}`}
                    />
                  </div>
                  {fieldConfig.showOptionChildren && (
                    <div className="options-table-cell">
                      <input
                        type="text"
                        className="options-table-child-input"
                        value={option?.children || ''}
                        onChange={(e) => handleOptionChange(index, 'children', e.target.value)}
                        placeholder="e.g., 1.1, 1.2"
                      />
                    </div>
                  )}
                  <div className="options-table-cell">
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => removeOption(index)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="options-section" style={{ marginTop: '0.625rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addOption}
                disabled={(formData.options || []).length >= (fieldConfig?.maxOptions || 20)}
              >
                Add Option ({(formData.options || []).length}/{fieldConfig?.maxOptions || 20})
              </button>
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        <div className="form-section">
          <h3>Settings</h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="isMandatory">Is Mandatory</label>
              <select id="isMandatory" name="isMandatory" value={formData.isMandatory} onChange={handleChange}>
                {yesNoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
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
                {yesNoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              {fieldConfig.isDynamic !== undefined && <small>Auto-set based on question type</small>}
            </div>

            <div className="form-group">
              <label htmlFor="mode">Mode</label>
              <select id="mode" name="mode" value={formData.mode} onChange={handleChange}>
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
                  disabled={Boolean(fieldConfig.textInputTypeValue)}
                >
                  {textInputTypes.map(type => <option key={type} value={type}>{type}</option>)}
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
                <input type="text" id="minValue" name="minValue" value={formData.minValue} onChange={handleChange} placeholder="Minimum value" />
              </div>
              <div className="form-group">
                <label htmlFor="maxValue">Max Value</label>
                <input type="text" id="maxValue" name="maxValue" value={formData.maxValue} onChange={handleChange} placeholder="Maximum value" />
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
                disabled={Boolean(fieldConfig.questionMediaTypeValue)}
              >
                {questionMediaTypes.map(type => <option key={type} value={type}>{type}</option>)}
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
              {formData.questionMediaType === 'None' && <small>Disabled when Media Type is None</small>}
            </div>
          </div>
        </div>

        {/* ── TRANSLATIONS ── */}
        {nonEnglishLanguages.length > 0 && (
          <div className="form-section">
            <h3>Translations</h3>
            <p className="translation-section-hint">
              Provide the question content in other survey languages. Use "Auto-translate" to fill from English automatically, then review and adjust as needed.
            </p>

            {nonEnglishLanguages.map(lang => (
              <div key={lang} className="translation-lang-card">
                <div className="translation-lang-header">
                  <div className="translation-lang-title">
                    <strong>{lang}</strong>
                    <span className="translation-native-script">({getNativeScript(lang)})</span>
                  </div>
                  <div className="translation-lang-actions">
                    {getISOCode(lang) ? (
                      <button
                        type="button"
                        className={`btn btn-sm ${translating[lang] ? 'btn-secondary' : 'btn-secondary'}`}
                        onClick={() => translateAll(lang)}
                        disabled={translating[lang] || !formData.questionDescription?.trim()}
                        title={!formData.questionDescription?.trim() ? 'Enter English description first' : `Auto-translate all fields to ${lang}`}
                      >
                        {translating[lang] ? '⟳ Translating…' : '↻ Auto-translate from English'}
                      </button>
                    ) : (
                      <span className="badge translation-manual-badge">Manual entry only</span>
                    )}
                  </div>
                </div>

                {translateErrors[lang] && (
                  <div className="error-message translation-error">
                    {translateErrors[lang]}
                  </div>
                )}

                <div className="form-group">
                  <label>Description in {lang}</label>
                  <textarea
                    value={langTranslations[lang]?.questionDescription || ''}
                    onChange={(e) => handleTranslationChange(lang, 'questionDescription', e.target.value)}
                    rows="3"
                    placeholder={`Question text in ${lang}…`}
                  />
                </div>

                {fieldConfig.showTableFields && (
                  <>
                    <div className="form-group">
                      <label>Table Header in {lang}</label>
                      <input
                        type="text"
                        value={langTranslations[lang]?.tableHeaderValue || ''}
                        onChange={(e) => handleTranslationChange(lang, 'tableHeaderValue', e.target.value)}
                        placeholder={`Table header in ${lang}…`}
                      />
                    </div>
                    <div className="form-group">
                      <label>Table Questions in {lang}</label>
                      <textarea
                        value={langTranslations[lang]?.tableQuestionValue || ''}
                        onChange={(e) => handleTranslationChange(lang, 'tableQuestionValue', e.target.value)}
                        rows="4"
                        placeholder={'Format:\na:Question 1\nb:Question 2'}
                      />
                    </div>
                  </>
                )}

                {fieldConfig.showOptions && (formData.options || []).length > 0 && (
                  <div className="form-group">
                    <label>Options in {lang}</label>
                    <div className="translation-options-grid">
                      <div className="translation-options-header">
                        <span>English</span>
                        <span>{lang} ({getNativeScript(lang)})</span>
                      </div>
                      {(formData.options || []).map((opt, i) => (
                        <div key={i} className="translation-option-row">
                          <span className="translation-option-source">
                            {opt.text || <em style={{ opacity: 0.5 }}>Option {i + 1}</em>}
                          </span>
                          <input
                            type="text"
                            value={langTranslations[lang]?.options?.[i]?.text || ''}
                            onChange={(e) => handleTranslationOptionChange(lang, i, e.target.value)}
                            placeholder={`${lang} translation`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── FORM ACTIONS ── */}
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary btn-cta btn-icon-cancel"
            onClick={() => navigate(`/surveys/${surveyId}/questions`)}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`btn btn-primary btn-cta ${isEdit ? 'btn-icon-update' : 'btn-icon-add'}`}
            disabled={loading}
          >
            {loading ? 'Saving…' : (isEdit ? 'Update Question' : 'Add Question')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default QuestionForm;
