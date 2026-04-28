import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { questionAPI, surveyAPI } from '../services/api';
import { useValidation } from '../hooks/useValidation';
import { questionTypes, textInputTypes, questionMediaTypes, yesNoOptions, getFieldsForQuestionType } from '../schemas/questionTypeSchema';
import { getNativeScript, getISOCode } from '../schemas/languageMappings';

const TABLE_QUESTION_MAX = 20;
const getRowLabel = (i) => String.fromCharCode(97 + i);

const parseTableHeaders = (str) => {
  if (!str) return ['', ''];
  const parts = str.split(',').map(h => h.trim());
  return [parts[0] || '', parts[1] || ''];
};

const parseTableQuestions = (str) => {
  if (!str) return [{ text: '' }];
  const rows = str.split('\n').map(line => {
    const idx = line.indexOf(':');
    return { text: idx > -1 ? line.substring(idx + 1).trim() : line.trim() };
  });
  return rows.length > 0 ? rows : [{ text: '' }];
};

const formatTableHeaders = (headers) => headers.filter(h => h?.trim()).join(', ');

const formatTableQuestions = (questions) =>
  questions.map((q, i) => `${getRowLabel(i)}:${q.text}`).join('\n');

const QuestionForm = () => {
  const navigate = useNavigate();
  const { surveyId, questionId } = useParams();
  const isEdit = Boolean(questionId);
  const { errors, validateQuestion, setErrors } = useValidation();
  const queryClient = useQueryClient();
  const initKey = useRef(null);  // tracks which (surveyId+questionId) we've initialized for

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

  const [tableHeaders, setTableHeaders] = useState(['', '']);
  const [tableQuestions, setTableQuestions] = useState([{ text: '' }]);

  // Per-language translated content (for non-English languages only)
  // Shape: { Hindi: { questionDescription, tableHeaders: ['',''], tableQuestions: [{text}], options: [{text}] }, ... }
  const [langTranslations, setLangTranslations] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [fieldConfig, setFieldConfig] = useState({});

  // ─── Load data (React Query) ───────────────────────────────────────────────

  const { data: _surveyData } = useQuery({
    queryKey: ['survey', surveyId],
    queryFn: () => surveyAPI.getById(surveyId),
  });

  const { data: _allQuestions } = useQuery({
    queryKey: ['questions', surveyId],
    queryFn: () => questionAPI.getAll(surveyId),
  });

  useEffect(() => {
    if (!_surveyData || !_allQuestions) return;
    const currentKey = `${surveyId}::${questionId ?? ''}`;
    if (initKey.current === currentKey) return;  // already initialized for this route
    initKey.current = currentKey;
    initializeForm(_surveyData, _allQuestions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_surveyData, _allQuestions, surveyId, questionId]);

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

  const buildEmptyLangSlots = (languages, englishOptCount, existingTranslations = {}, existingTableQCount = 1) => {
    const result = {};
    languages.filter(l => l !== 'English').forEach(lang => {
      const ex = existingTranslations[lang] || {};
      const exHeaders = ex.tableHeaders || parseTableHeaders(ex.tableHeaderValue || '');
      const exQuestions = ex.tableQuestions || parseTableQuestions(ex.tableQuestionValue || '');
      result[lang] = {
        questionDescription: ex.questionDescription || '',
        tableHeaders: [exHeaders[0] || '', exHeaders[1] || ''],
        tableQuestions: Array.from({ length: existingTableQCount }, (_, i) => ({
          text: exQuestions[i]?.text || ''
        })),
        options: Array.from({ length: englishOptCount }, (_, i) => ({
          text: ex.options?.[i]?.text || ''
        }))
      };
    });
    return result;
  };

  const initializeForm = (surveyData, questions) => {
    setLoadError(null);
    setSurvey(surveyData);

    const langs = parseAvailableMediums(surveyData);
    const effectiveLangs = langs.length > 0 ? langs : ['English'];
    setSurveyLanguages(effectiveLangs);
    setExistingQuestions(questions);

    if (!isEdit) {
      setFormData(prev => ({ ...prev, medium: effectiveLangs[0] || 'English' }));
      setTableHeaders(['', '']);
      setTableQuestions([{ text: '' }]);
      setLangTranslations(buildEmptyLangSlots(effectiveLangs, 0, {}, 1));
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

    const parsedHeaders = parseTableHeaders(englishSrc.tableHeaderValue || question.tableHeaderValue || '');
    const parsedQuestions = parseTableQuestions(englishSrc.tableQuestionValue || question.tableQuestionValue || '');

    setTableHeaders(parsedHeaders);
    setTableQuestions(parsedQuestions);

    setFormData(prev => ({
      ...prev,
      ...question,
      questionDescription: englishSrc.questionDescription || question.questionDescription || '',
      options: englishOptions,
      medium: question.medium || effectiveLangs[0] || 'English'
    }));

    setLangTranslations(buildEmptyLangSlots(effectiveLangs, englishOptions.length, storedTranslations, parsedQuestions.length));
  };

  const nonEnglishLanguages = surveyLanguages.filter(l => l !== 'English');

  // ─── Parent-mandatory rule ────────────────────────────────────────────────
  // A child question cannot be mandatory unless its parent is mandatory.

  const resolveParentQuestion = () => {
    const id = String(formData.questionId || '').trim();
    if (!id.includes('.')) return null;
    const explicit = String(formData.sourceQuestion || '').trim();
    const parentId = (/^q/i.test(explicit) ? `Q${explicit.slice(1)}` : (/^\d+(\.\d+)*$/.test(explicit) ? `Q${explicit}` : explicit))
      || (() => {
        const norm = /^q/i.test(id) ? `Q${id.slice(1)}` : (/^\d+(\.\d+)*$/.test(id) ? `Q${id}` : id);
        return norm.includes('.') ? norm.split('.').slice(0, -1).join('.') : '';
      })();
    if (!parentId) return null;
    return existingQuestions.find(q => q.surveyId === surveyId && q.questionId === parentId) || null;
  };

  const getOptionsList = (question) => {
    if (!question) return [];
    if (Array.isArray(question.options) && question.options.length > 0) return question.options;
    const t = question.translations || {};
    if (t.English?.options) return t.English.options;
    const first = Object.keys(t)[0];
    return t[first]?.options || [];
  };

  const countOptionsWithChildren = (question) => {
    return getOptionsList(question).reduce((acc, opt) => {
      const list = String(opt?.children || '').split(',').map(s => s.trim()).filter(Boolean);
      return acc + (list.length > 0 ? 1 : 0);
    }, 0);
  };

  const parentQuestion = resolveParentQuestion();
  const isChildQuestion = String(formData.questionId || '').includes('.');
  const parentIsMandatory = parentQuestion?.isMandatory === 'Yes';
  const parentOptionsWithChildrenCount = parentQuestion ? countOptionsWithChildren(parentQuestion) : 0;
  const parentHasMultiOptionChildren = parentOptionsWithChildrenCount >= 2;
  const mandatoryLockedByParent = isChildQuestion && parentQuestion != null
    && (!parentIsMandatory || parentHasMultiOptionChildren);

  const mandatoryLockReason = !mandatoryLockedByParent ? '' : (
    parentHasMultiOptionChildren
      ? `Parent ${parentQuestion.questionId} branches into ${parentOptionsWithChildrenCount} options with child questions, so no child of ${parentQuestion.questionId} can be mandatory.`
      : `Parent ${parentQuestion.questionId} is not mandatory, so this child cannot be mandatory.`
  );

  useEffect(() => {
    if (mandatoryLockedByParent && formData.isMandatory === 'Yes') {
      setFormData(prev => ({ ...prev, isMandatory: 'No' }));
      setErrors(prev => { const e = { ...prev }; delete e.isMandatory; return e; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandatoryLockedByParent]);

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

  // ─── Table header / question handlers ────────────────────────────────────

  const handleTableHeaderChange = (index, value) => {
    setTableHeaders(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleTableQuestionChange = (index, value) => {
    setTableQuestions(prev => {
      const next = [...prev];
      next[index] = { text: value };
      return next;
    });
  };

  const addTableQuestion = () => {
    if (tableQuestions.length >= TABLE_QUESTION_MAX) return;
    setTableQuestions(prev => [...prev, { text: '' }]);
    setLangTranslations(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(lang => {
        updated[lang] = { ...updated[lang], tableQuestions: [...(updated[lang].tableQuestions || []), { text: '' }] };
      });
      return updated;
    });
  };

  const removeTableQuestion = (index) => {
    if (tableQuestions.length <= 1) return;
    setTableQuestions(prev => prev.filter((_, i) => i !== index));
    setLangTranslations(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(lang => {
        updated[lang] = { ...updated[lang], tableQuestions: (updated[lang].tableQuestions || []).filter((_, i) => i !== index) };
      });
      return updated;
    });
  };

  const handleTranslationTableHeaderChange = (lang, index, value) => {
    setLangTranslations(prev => {
      const headers = [...(prev[lang]?.tableHeaders || ['', ''])];
      headers[index] = value;
      return { ...prev, [lang]: { ...prev[lang], tableHeaders: headers } };
    });
  };

  const handleTranslationTableQuestionChange = (lang, index, value) => {
    setLangTranslations(prev => {
      const questions = [...(prev[lang]?.tableQuestions || [])];
      questions[index] = { text: value };
      return { ...prev, [lang]: { ...prev[lang], tableQuestions: questions } };
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

    // Only include table fields for tabular question types
    const isTableType = fieldConfig.showTableFields === true;
    const englishTableHeaderValue = isTableType ? formatTableHeaders(tableHeaders) : '';
    const englishTableQuestionValue = isTableType ? formatTableQuestions(tableQuestions) : '';

    // Build translations for all survey languages
    const translations = {
      English: {
        questionDescription: formData.questionDescription || '',
        tableHeaderValue: englishTableHeaderValue,
        tableQuestionValue: englishTableQuestionValue,
        options: englishOptions
      }
    };

    nonEnglishLanguages.forEach(lang => {
      const langData = langTranslations[lang] || {};
      let langHeaderValue = '';
      let langQuestionValue = '';
      if (isTableType) {
        langHeaderValue = formatTableHeaders(langData.tableHeaders || ['', '']) || englishTableHeaderValue;
        langQuestionValue = formatTableQuestions(
          (langData.tableQuestions || []).length > 0 ? langData.tableQuestions : tableQuestions.map(() => ({ text: '' }))
        ) || englishTableQuestionValue;
      }
      translations[lang] = {
        questionDescription: langData.questionDescription || formData.questionDescription || '',
        tableHeaderValue: langHeaderValue,
        tableQuestionValue: langQuestionValue,
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
      tableHeaderValue: englishTableHeaderValue,
      tableQuestionValue: englishTableQuestionValue,
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
    if (loading) return; // guard against double-submit
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

    // Min/Max value sanity check
    const minRaw = formData.minValue;
    const maxRaw = formData.maxValue;
    const hasMin = minRaw !== null && minRaw !== undefined && String(minRaw).trim() !== '';
    const hasMax = maxRaw !== null && maxRaw !== undefined && String(maxRaw).trim() !== '';
    if (hasMin && hasMax) {
      const minNum = Number(minRaw);
      const maxNum = Number(maxRaw);
      if (!Number.isFinite(minNum) || !Number.isFinite(maxNum)) {
        setErrors({ maxValue: 'Min and Max Value must be numbers' });
        setSubmitError('Min and Max Value must be numbers');
        return;
      }
      if (maxNum <= minNum) {
        setErrors({ maxValue: `Max Value (${maxNum}) must be greater than Min Value (${minNum})` });
        setSubmitError(`Max Value (${maxNum}) must be greater than Min Value (${minNum})`);
        return;
      }
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
      if (parentQ && payload.isMandatory === 'Yes') {
        const parentOptionsCount = countOptionsWithChildren(parentQ);
        if (parentOptionsCount >= 2) {
          const msg = `Child cannot be mandatory: parent ${parentQ.questionId} has child questions mapped to ${parentOptionsCount} different options, so none of its children can be mandatory.`;
          setErrors({ isMandatory: msg });
          setSubmitError(msg);
          return;
        }
        if (parentQ.isMandatory !== 'Yes') {
          setErrors({ isMandatory: `Child question cannot be mandatory because parent ${parentQ.questionId} is not mandatory.` });
          setSubmitError(`Child question cannot be marked mandatory: parent question ${parentQ.questionId} is not mandatory. Set the parent to mandatory first, or set this child to "No".`);
          return;
        }
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
      queryClient.invalidateQueries({ queryKey: ['questions', surveyId] });
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
            <>
              <div className="form-group">
                <label>
                  Table Headers {nonEnglishLanguages.length > 0 ? '(English)' : ''} <span className="required">*</span>
                </label>
                <div className="form-row" style={{ gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <input
                      type="text"
                      value={tableHeaders[0]}
                      onChange={(e) => handleTableHeaderChange(0, e.target.value)}
                      placeholder="Header 1 (e.g., Criteria)"
                      className={errors.tableHeaderValue ? 'error' : ''}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <input
                      type="text"
                      value={tableHeaders[1]}
                      onChange={(e) => handleTableHeaderChange(1, e.target.value)}
                      placeholder="Header 2 (e.g., Value)"
                      className={errors.tableHeaderValue ? 'error' : ''}
                    />
                  </div>
                </div>
                {errors.tableHeaderValue && <span className="error-text">{errors.tableHeaderValue}</span>}
              </div>

              <div className="form-group">
                <label>
                  Table Questions {nonEnglishLanguages.length > 0 ? '(English)' : ''} <span className="required">*</span>
                </label>
                {errors.tableQuestionValue && <span className="error-text">{errors.tableQuestionValue}</span>}
                <div className="options-table" style={{ marginTop: '0.5rem' }}>
                  <div className="options-table-row options-table-header">
                    <div className="options-table-cell" style={{ width: '2.5rem', flexShrink: 0 }}>#</div>
                    <div className="options-table-cell">Row Question {nonEnglishLanguages.length > 0 ? '(English)' : ''}</div>
                    <div className="options-table-cell options-table-label">Action</div>
                  </div>
                  {tableQuestions.map((tq, index) => (
                    <div className="options-table-row" key={`tq-${index}`}>
                      <div className="options-table-cell table-row-label-col">
                        <span className="table-row-label">{getRowLabel(index)}</span>
                      </div>
                      <div className="options-table-cell">
                        <input
                          type="text"
                          value={tq.text}
                          onChange={(e) => handleTableQuestionChange(index, e.target.value)}
                          placeholder={`Row ${index + 1} question`}
                        />
                      </div>
                      <div className="options-table-cell">
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => removeTableQuestion(index)}
                          disabled={tableQuestions.length <= 1}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '0.625rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={addTableQuestion}
                    disabled={tableQuestions.length >= TABLE_QUESTION_MAX}
                  >
                    Add Row ({tableQuestions.length}/{TABLE_QUESTION_MAX})
                  </button>
                </div>
              </div>
            </>
          )}
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

        {/* ── TRANSLATIONS ── */}
        {nonEnglishLanguages.length > 0 && (
          <div className="form-section">
            <h3>Translations</h3>
            <p className="translation-section-hint">
              Provide the question content in other survey languages below.
            </p>

            {nonEnglishLanguages.map(lang => (
              <div key={lang} className="translation-lang-card">
                <div className="translation-lang-header">
                  <div className="translation-lang-title">
                    <strong>{lang}</strong>
                    <span className="translation-native-script">({getNativeScript(lang)})</span>
                  </div>
                </div>

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
                      <label>Table Headers in {lang}</label>
                      <div className="form-row" style={{ gap: '0.75rem' }}>
                        {[0, 1].map(idx => (
                          <div key={idx} className="form-group" style={{ marginBottom: 0 }}>
                            <input
                              type="text"
                              value={langTranslations[lang]?.tableHeaders?.[idx] || ''}
                              onChange={(e) => handleTranslationTableHeaderChange(lang, idx, e.target.value)}
                              placeholder={tableHeaders[idx] ? `"${tableHeaders[idx]}" in ${lang}` : `Header ${idx + 1} in ${lang}…`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    {tableQuestions.length > 0 && (
                      <div className="form-group">
                        <label>Table Questions in {lang}</label>
                        <div className="translation-options-grid">
                          <div className="translation-options-header">
                            <span>English</span>
                            <span>{lang} ({getNativeScript(lang)})</span>
                          </div>
                          {tableQuestions.map((tq, i) => (
                            <div key={i} className="translation-option-row">
                              <span className="translation-option-source">
                                <span className="table-row-label" style={{ marginRight: '0.375rem' }}>{getRowLabel(i)}</span>
                                {tq.text || <em style={{ opacity: 0.5 }}>Row {i + 1}</em>}
                              </span>
                              <input
                                type="text"
                                value={langTranslations[lang]?.tableQuestions?.[i]?.text || ''}
                                onChange={(e) => handleTranslationTableQuestionChange(lang, i, e.target.value)}
                                placeholder={`${lang} translation`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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

        {/* ── SETTINGS ── */}
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
                disabled={mandatoryLockedByParent}
                className={errors.isMandatory ? 'error' : ''}
              >
                {yesNoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              {mandatoryLockedByParent && (
                <small>Disabled: {mandatoryLockReason}</small>
              )}
              {errors.isMandatory && <span className="error-text">{errors.isMandatory}</span>}
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
