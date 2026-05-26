import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { questionAPI, surveyAPI } from '../services/api';
import { useValidation } from '../hooks/useValidation';
import { questionTypes, textInputTypes, questionMediaTypes, yesNoOptions, getFieldsForQuestionType } from '../schemas/questionTypeSchema';
import { getNativeScript } from '../schemas/languageMappings';
import PageHeader from './ui/PageHeader';
import Icon from './ui/Icon';
import Badge from './ui/Badge';
import Chip from './ui/Chip';

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

const formatTableQuestions = (questions) => {
  if (!questions.some(q => (q?.text || '').trim() !== '')) return '';
  return questions.map((q, i) => `${getRowLabel(i)}:${q?.text || ''}`).join('\n');
};

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

  const parentQuestion = resolveParentQuestion();
  const isChildQuestion = String(formData.questionId || '').includes('.');
  const parentIsMandatory = parentQuestion?.isMandatory === 'Yes';
  const mandatoryLockedByParent = isChildQuestion && parentQuestion != null && !parentIsMandatory;

  const mandatoryLockReason = mandatoryLockedByParent
    ? `Parent ${parentQuestion.questionId} is not mandatory, so this child cannot be mandatory.`
    : '';

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

  // Auto-prefix child IDs with the parent question ID (e.g. "Q2.") so the user
  // only types the trailing segment. Active only for Multiple Choice Single
  // Select questions where the parent ID is known.
  const childAutoPrefix = (() => {
    if (formData.questionType !== 'Multiple Choice Single Select') return '';
    const normalized = normalizeQuestionId(formData.questionId);
    return normalized ? `${normalized}.` : '';
  })();

  const moveCaretToEnd = (input, length) => {
    if (!input) return;
    requestAnimationFrame(() => {
      try { input.setSelectionRange(length, length); } catch (_e) { /* ignore unsupported types */ }
    });
  };

  const handleChildFocus = (event, index) => {
    if (!childAutoPrefix) return;
    const input = event.target;
    const current = String(formData.options?.[index]?.children || '').trim();
    if (current === '') {
      handleOptionChange(index, 'children', childAutoPrefix);
      moveCaretToEnd(input, childAutoPrefix.length);
    }
  };

  const handleChildChange = (event, index) => {
    const newValue = event.target.value;
    const input = event.target;
    if (!childAutoPrefix) {
      handleOptionChange(index, 'children', newValue);
      return;
    }
    const oldValue = formData.options?.[index]?.children || '';
    if (newValue.endsWith(',') && !oldValue.endsWith(',')) {
      const finalValue = `${newValue}${childAutoPrefix}`;
      handleOptionChange(index, 'children', finalValue);
      moveCaretToEnd(input, finalValue.length);
      return;
    }
    handleOptionChange(index, 'children', newValue);
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
      if (parentQ && payload.isMandatory === 'Yes' && parentQ.isMandatory !== 'Yes') {
        setErrors({ isMandatory: `Child question cannot be mandatory because parent ${parentQ.questionId} is not mandatory.` });
        setSubmitError(`Child question cannot be marked mandatory: parent question ${parentQ.questionId} is not mandatory. Set the parent to mandatory first, or set this child to "No".`);
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

  // ─── Live-preview derivations (Phase 8B) ────────────────────────────────
  // The right-side preview reads ONLY from existing form state. It never
  // mutates state, never calls an API, never alters the payload contract.
  const preview = (() => {
    const id = String(formData.questionId || '').trim();
    const normalizedId = id ? normalizeQuestionId(id) : '';
    const isChild = normalizedId.includes('.');
    const derivedParent = isChild ? getParentQuestionId(normalizedId) : '';
    const parentId = String(formData.sourceQuestion || '').trim() || derivedParent;

    const optionCount = Array.isArray(formData.options) ? formData.options.length : 0;
    const tableRowCount = fieldConfig.showTableFields ? tableQuestions.length : 0;

    return {
      id: normalizedId,
      type: formData.questionType,
      isMandatory: formData.isMandatory === 'Yes',
      isDynamic: formData.isDynamic === 'Yes',
      description: formData.questionDescription,
      medium: formData.medium,
      optionCount,
      tableRowCount,
      parentId,
      showOptions: fieldConfig.showOptions === true,
      showTable: fieldConfig.showTableFields === true,
    };
  })();

  // ─── Render ───────────────────────────────────────────────────────────────

  const backToQuestions = () => navigate(`/surveys/${surveyId}/questions`);

  // Loading skeleton — replaces the bare "Loading…" div. Tests gate on the
  // form heading via `findByRole('heading', { name: /Add New Question|Edit Question/i })`,
  // so the skeleton title is deliberately a NON-matching phrase ("Question
  // form") to avoid resolving the form's heading wait too early.
  if (!survey && !loadError) {
    return (
      <div className="fmb-qf-page" data-testid="questionform-loading">
        <PageHeader
          eyebrow={surveyId || undefined}
          title="Question form"
          sub="Loading…"
        />
        <div className="fmb-qf-shell">
          <div className="fmb-qf-main">
            {[0, 1, 2].map(i => (
              <div key={i} className="fmb-qf-skel" style={{ height: 180 }} />
            ))}
          </div>
          <div className="fmb-qf-skel" style={{ height: 260 }} />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="fmb-qf-page" data-testid="questionform-load-error">
        <PageHeader
          eyebrow={surveyId || undefined}
          title={isEdit ? 'Edit Question' : 'Add New Question'}
          sub="We couldn't load this question."
          actions={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={backToQuestions}
            >
              <Icon name="chevronLeft" /> Back to Questions
            </button>
          }
        />
        <div className="fmb-qf-error-banner" role="alert">
          <div><span className="fmb-qf-error-banner-title">Error: </span>{loadError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fmb-qf-page">
      <PageHeader
        eyebrow={surveyId || undefined}
        title={isEdit ? 'Edit Question' : 'Add New Question'}
        sub={isEdit
          ? 'Update the question content, options, translations, and behavior.'
          : 'Define a new question for this survey. Add options, translations, and behavior settings as needed.'}
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={backToQuestions}
          >
            <Icon name="chevronLeft" /> Back to Questions
          </button>
        }
      />

      {(submitError || Object.keys(errors).length > 0) && (
        <div className="fmb-qf-error-banner" role="alert">
          {submitError && (
            <div>
              <span className="fmb-qf-error-banner-title">Error: </span>{submitError}
            </div>
          )}
          {Object.keys(errors).length > 0 && (
            <div data-testid="qf-error-summary">
              <div className="fmb-qf-error-banner-title">Please fix the following errors:</div>
              <ul>
                {Object.entries(errors).map(([field, message]) => (
                  <li key={field}>{message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="fmb-qf-shell">
          {/* ── Left column: section cards ───────────────────── */}
          <div className="fmb-qf-main">

            {/* Content */}
            <section className="fmb-qf-section" aria-labelledby="qf-content-h">
              <header className="fmb-qf-section-head">
                <h3 id="qf-content-h" className="fmb-qf-section-title">Content</h3>
                <p className="fmb-qf-section-sub">
                  The question's identifier, type, and primary text. Use the
                  format <span className="fmb-qf-mono">1, 2, or 1.1</span> for
                  IDs — they're saved as <span className="fmb-qf-mono">Q1, Q1.1</span>.
                </p>
              </header>

              <div className="fmb-qf-grid cols-2">
                <div className="fmb-qf-field">
                  <label htmlFor="questionId" className="fmb-qf-field-label">
                    Question ID <span className="fmb-qf-field-required">*</span>
                  </label>
                  <input
                    type="text"
                    id="questionId"
                    name="questionId"
                    value={formData.questionId}
                    onChange={handleChange}
                    disabled={isEdit}
                    placeholder="e.g., 1, 1.1, 2"
                    className="fmb-qf-field-input fmb-qf-mono"
                    aria-invalid={errors.questionId ? 'true' : 'false'}
                  />
                  {errors.questionId && <div className="fmb-qf-field-error">{errors.questionId}</div>}
                  <p className="fmb-qf-field-help">Format: 1, 2, or 1.1 for child questions (saved as Q1, Q1.1)</p>
                </div>

                <div className="fmb-qf-field">
                  <label htmlFor="questionType" className="fmb-qf-field-label">
                    Question Type <span className="fmb-qf-field-required">*</span>
                  </label>
                  <select
                    id="questionType"
                    name="questionType"
                    value={formData.questionType}
                    onChange={handleChange}
                    className="fmb-qf-field-select"
                    aria-invalid={errors.questionType ? 'true' : 'false'}
                  >
                    <option value="">Select Question Type</option>
                    {questionTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {errors.questionType && <div className="fmb-qf-field-error">{errors.questionType}</div>}
                </div>
              </div>

              {surveyLanguages.length > 0 && (
                <div className="fmb-qf-lang-hint">
                  <strong>Survey languages:</strong> {surveyLanguages.join(', ')}
                  {nonEnglishLanguages.length > 0 && (
                    <span style={{ marginLeft: 4 }}>— Enter English content below, then add translations in the <em>Translations</em> section.</span>
                  )}
                </div>
              )}

              <div className="fmb-qf-field">
                <label htmlFor="questionDescription" className="fmb-qf-field-label">
                  Question Description {nonEnglishLanguages.length > 0 ? '(English)' : ''} <span className="fmb-qf-field-required">*</span>
                </label>
                <textarea
                  id="questionDescription"
                  name="questionDescription"
                  value={formData.questionDescription}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Enter question text in English"
                  className="fmb-qf-field-textarea"
                  aria-invalid={errors.questionDescription ? 'true' : 'false'}
                />
                {errors.questionDescription && <div className="fmb-qf-field-error">{errors.questionDescription}</div>}
              </div>

              <div className="fmb-qf-field">
                <label htmlFor="questionDescriptionOptional" className="fmb-qf-field-label">Question Description Optional</label>
                <input
                  type="text"
                  id="questionDescriptionOptional"
                  name="questionDescriptionOptional"
                  value={formData.questionDescriptionOptional}
                  onChange={handleChange}
                  maxLength="256"
                  placeholder="Optional description (max 256 characters)"
                  className="fmb-qf-field-input"
                />
              </div>

              {fieldConfig.showTableFields && (
                <>
                  <div className="fmb-qf-field">
                    <span className="fmb-qf-field-label">
                      Table Headers {nonEnglishLanguages.length > 0 ? '(English)' : ''} <span className="fmb-qf-field-required">*</span>
                    </span>
                    <div className="fmb-qf-table-headers">
                      <div className="fmb-qf-table-headers-cell">
                        <span className="fmb-qf-table-headers-cell-label">Column 1</span>
                        <input
                          type="text"
                          value={tableHeaders[0]}
                          onChange={(e) => handleTableHeaderChange(0, e.target.value)}
                          placeholder="Header 1 (e.g., Criteria)"
                          className="fmb-qf-field-input"
                          aria-invalid={errors.tableHeaderValue ? 'true' : 'false'}
                          aria-label="Table header 1"
                        />
                      </div>
                      <div className="fmb-qf-table-headers-cell">
                        <span className="fmb-qf-table-headers-cell-label">Column 2</span>
                        <input
                          type="text"
                          value={tableHeaders[1]}
                          onChange={(e) => handleTableHeaderChange(1, e.target.value)}
                          placeholder="Header 2 (e.g., Value)"
                          className="fmb-qf-field-input"
                          aria-invalid={errors.tableHeaderValue ? 'true' : 'false'}
                          aria-label="Table header 2"
                        />
                      </div>
                    </div>
                    {errors.tableHeaderValue && <div className="fmb-qf-field-error">{errors.tableHeaderValue}</div>}
                  </div>

                  <div className="fmb-qf-field">
                    <span className="fmb-qf-field-label">
                      Table Questions {nonEnglishLanguages.length > 0 ? '(English)' : ''} <span className="fmb-qf-field-required">*</span>
                    </span>
                    {errors.tableQuestionValue && <div className="fmb-qf-field-error">{errors.tableQuestionValue}</div>}

                    <div className="fmb-qf-row-legend tableq" aria-hidden="true">
                      <span className="fmb-qf-row-legend-spacer" />
                      <span>Row question {nonEnglishLanguages.length > 0 ? '(English)' : ''}</span>
                      <span className="fmb-qf-row-legend-spacer" />
                    </div>

                    <div className="fmb-qf-rows">
                      {tableQuestions.map((tq, index) => (
                        <div
                          key={`tq-${index}`}
                          className="fmb-qf-row tableq"
                          data-testid="qf-table-row"
                          data-index={index}
                        >
                          <span className="fmb-qf-row-num" aria-hidden="true">{getRowLabel(index)}</span>

                          <div className="fmb-qf-row-field">
                            <span className="fmb-qf-row-inline-label">
                              Row {index + 1} question {nonEnglishLanguages.length > 0 ? '(English)' : ''}
                            </span>
                            <input
                              type="text"
                              value={tq.text}
                              onChange={(e) => handleTableQuestionChange(index, e.target.value)}
                              placeholder={`Row ${index + 1} question`}
                              className="fmb-qf-row-input"
                              aria-label={`Row ${index + 1} question text`}
                            />
                          </div>

                          <button
                            type="button"
                            className="fmb-qf-row-remove"
                            onClick={() => removeTableQuestion(index)}
                            disabled={tableQuestions.length <= 1}
                            aria-label="Remove"
                            title={tableQuestions.length <= 1 ? 'At least one row is required' : 'Remove row'}
                          >
                            <Icon name="x" size={14} />
                            <span className="fmb-qf-row-remove-text">Remove</span>
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="fmb-qf-rows-toolbar">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={addTableQuestion}
                        disabled={tableQuestions.length >= TABLE_QUESTION_MAX}
                      >
                        <Icon name="plus" size={14} /> Add Row
                      </button>
                      <span className="fmb-qf-rows-meta">
                        {tableQuestions.length} of {TABLE_QUESTION_MAX}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* Options (English) — Phase 8C card-row redesign */}
            {fieldConfig.showOptions && (
              <section className="fmb-qf-section" aria-labelledby="qf-options-h">
                <header className="fmb-qf-section-head">
                  <h3 id="qf-options-h" className="fmb-qf-section-title">
                    Options {nonEnglishLanguages.length > 0 ? '(English)' : ''}
                  </h3>
                  <p className="fmb-qf-section-sub">
                    The list of choices respondents pick from.
                    {fieldConfig.showOptionChildren && ' Each option may map to a child question by entering its Question ID below.'}
                  </p>
                </header>
                {errors.options && <div className="fmb-qf-field-error">{errors.options}</div>}

                {/* Column legend — always rendered (even when 0 options) so the
                    lock-in test `getByText('Child Questions')` always resolves. */}
                <div
                  className={`fmb-qf-row-legend ${fieldConfig.showOptionChildren ? 'with-children' : 'text-only'}`}
                  aria-hidden="true"
                >
                  <span className="fmb-qf-row-legend-spacer" />
                  <span>Option text {nonEnglishLanguages.length > 0 ? '(English)' : ''}</span>
                  {fieldConfig.showOptionChildren && <span>Child Questions</span>}
                  <span className="fmb-qf-row-legend-spacer" />
                </div>

                <div className="fmb-qf-rows">
                  {(formData.options || []).length === 0 ? (
                    <div className="fmb-qf-rows-empty">
                      No options yet. Click <strong>Add Option</strong> to create the first one.
                    </div>
                  ) : (
                    (formData.options || []).map((option, index) => (
                      <div
                        key={`option-${index}`}
                        className={`fmb-qf-row ${fieldConfig.showOptionChildren ? 'with-children' : 'text-only'}`}
                        data-testid="qf-option-row"
                        data-index={index}
                      >
                        <span className="fmb-qf-row-num" aria-hidden="true">{index + 1}</span>

                        <div className="fmb-qf-row-field">
                          <span className="fmb-qf-row-inline-label">
                            Option text {nonEnglishLanguages.length > 0 ? '(English)' : ''}
                          </span>
                          <input
                            type="text"
                            value={option?.text || ''}
                            onChange={(e) => handleOptionChange(index, 'text', e.target.value)}
                            placeholder={`Option ${index + 1}`}
                            className="fmb-qf-row-input"
                            aria-label={`Option ${index + 1} text`}
                          />
                        </div>

                        {fieldConfig.showOptionChildren && (
                          <div className="fmb-qf-row-field">
                            <span className="fmb-qf-row-inline-label">Child Questions</span>
                            <input
                              type="text"
                              value={option?.children || ''}
                              onFocus={(e) => handleChildFocus(e, index)}
                              onChange={(e) => handleChildChange(e, index)}
                              placeholder={childAutoPrefix
                                ? `e.g., ${childAutoPrefix}1, ${childAutoPrefix}2`
                                : 'e.g., 1.1, 1.2'}
                              className="fmb-qf-row-input is-mono"
                              aria-label={`Option ${index + 1} children`}
                            />
                          </div>
                        )}

                        <button
                          type="button"
                          className="fmb-qf-row-remove"
                          onClick={() => removeOption(index)}
                          aria-label="Remove"
                          title="Remove option"
                        >
                          <Icon name="x" size={14} />
                          <span className="fmb-qf-row-remove-text">Remove</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="fmb-qf-rows-toolbar">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={addOption}
                    disabled={(formData.options || []).length >= (fieldConfig?.maxOptions || 20)}
                  >
                    <Icon name="plus" size={14} /> Add Option
                  </button>
                  <span className="fmb-qf-rows-meta">
                    {(formData.options || []).length} of {fieldConfig?.maxOptions || 20}
                  </span>
                </div>
              </section>
            )}

            {/* Translations — Phase 8D card redesign */}
            {nonEnglishLanguages.length > 0 && (
              <section className="fmb-qf-section" aria-labelledby="qf-translations-h">
                <header className="fmb-qf-section-head">
                  <h3 id="qf-translations-h" className="fmb-qf-section-title">Translations</h3>
                  <p className="fmb-qf-section-sub">
                    Translate respondent-facing text for each non-English survey
                    language. Auto-translate isn't wired yet — enter each value
                    manually for now.
                  </p>
                </header>

                {nonEnglishLanguages.map(lang => {
                  const langData = langTranslations[lang] || {};
                  const descFilled = (langData.questionDescription || '').trim() !== '';

                  const headersTotal = fieldConfig.showTableFields ? 2 : 0;
                  const headersFilled = fieldConfig.showTableFields
                    ? [0, 1].filter(i => (langData.tableHeaders?.[i] || '').trim() !== '').length
                    : 0;

                  const rowsTotal = fieldConfig.showTableFields ? tableQuestions.length : 0;
                  const rowsFilled = fieldConfig.showTableFields
                    ? (langData.tableQuestions || []).filter(t => (t?.text || '').trim() !== '').length
                    : 0;

                  const optsTotal = fieldConfig.showOptions ? (formData.options || []).length : 0;
                  const optsFilled = fieldConfig.showOptions
                    ? (langData.options || []).filter(o => (o?.text || '').trim() !== '').length
                    : 0;

                  const filled = (descFilled ? 1 : 0) + headersFilled + rowsFilled + optsFilled;
                  const total = 1 + headersTotal + rowsTotal + optsTotal;

                  const progressClass =
                    total === 0
                      ? ''
                      : filled === 0
                        ? 'empty'
                        : filled === total
                          ? 'complete'
                          : '';

                  return (
                    <div
                      key={lang}
                      className="fmb-qf-trans-card"
                      data-testid="qf-lang-card"
                      data-lang={lang}
                    >
                      <header className="fmb-qf-trans-head">
                        <div className="fmb-qf-trans-head-name">
                          <span className="fmb-qf-trans-lang">{lang}</span>
                          <span className="fmb-qf-trans-script">({getNativeScript(lang)})</span>
                        </div>
                        <span
                          className={`fmb-qf-trans-progress ${progressClass}`}
                          data-testid={`qf-lang-progress-${lang}`}
                          aria-label={`${filled} of ${total} translation fields complete`}
                        >
                          {filled}/{total}
                          <span style={{ textTransform: 'uppercase', opacity: 0.7 }}>
                            {filled === total ? ' done' : filled === 0 ? ' empty' : ' in progress'}
                          </span>
                        </span>
                        <p className="fmb-qf-trans-sub">
                          Translate respondent-facing text for this language.
                        </p>
                      </header>

                      <div className="fmb-qf-trans-body">
                        {/* Question description */}
                        <div className="fmb-qf-field">
                          <label
                            htmlFor={`qf-trans-${lang}-desc`}
                            className="fmb-qf-field-label"
                          >
                            Question text ({lang})
                          </label>
                          <textarea
                            id={`qf-trans-${lang}-desc`}
                            value={langData.questionDescription || ''}
                            onChange={(e) => handleTranslationChange(lang, 'questionDescription', e.target.value)}
                            rows="3"
                            placeholder={`Question text in ${lang}…`}
                            className="fmb-qf-field-textarea"
                          />
                        </div>

                        {/* Table headers translations */}
                        {fieldConfig.showTableFields && (
                          <div className="fmb-qf-field">
                            <span className="fmb-qf-field-label">Table headers ({lang})</span>
                            <div className="fmb-qf-table-headers">
                              {[0, 1].map(idx => (
                                <div key={idx} className="fmb-qf-table-headers-cell">
                                  <span className="fmb-qf-table-headers-cell-label">
                                    Column {idx + 1} {tableHeaders[idx] ? `· ${tableHeaders[idx]}` : ''}
                                  </span>
                                  <input
                                    type="text"
                                    value={langData.tableHeaders?.[idx] || ''}
                                    onChange={(e) => handleTranslationTableHeaderChange(lang, idx, e.target.value)}
                                    placeholder={tableHeaders[idx] ? `"${tableHeaders[idx]}" in ${lang}` : `Header ${idx + 1} in ${lang}…`}
                                    className="fmb-qf-field-input"
                                    aria-label={`Table header ${idx + 1} in ${lang}`}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Table-question translations */}
                        {fieldConfig.showTableFields && tableQuestions.length > 0 && (
                          <div className="fmb-qf-field">
                            <span className="fmb-qf-field-label">Row translations ({lang})</span>
                            <div className="fmb-qf-row-legend trans" aria-hidden="true">
                              <span className="fmb-qf-row-legend-spacer" />
                              <span>Source (English)</span>
                              <span>{lang} ({getNativeScript(lang)})</span>
                            </div>
                            <div className="fmb-qf-rows">
                              {tableQuestions.map((tq, i) => {
                                const sourceText = (tq?.text || '').trim();
                                return (
                                  <div key={i} className="fmb-qf-row trans">
                                    <span className="fmb-qf-row-num" aria-hidden="true">{getRowLabel(i)}</span>
                                    <div
                                      className={`fmb-qf-trans-source${sourceText ? '' : ' placeholder'}`}
                                      title={sourceText || `Row ${i + 1} (untranslated source)`}
                                    >
                                      {sourceText || <em>Row {i + 1}</em>}
                                    </div>
                                    <input
                                      type="text"
                                      value={langData.tableQuestions?.[i]?.text || ''}
                                      onChange={(e) => handleTranslationTableQuestionChange(lang, i, e.target.value)}
                                      placeholder={`${lang} translation`}
                                      className="fmb-qf-row-input"
                                      aria-label={`Row ${i + 1} translation in ${lang}`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Option translations */}
                        {fieldConfig.showOptions && (formData.options || []).length > 0 && (
                          <div className="fmb-qf-field">
                            <span className="fmb-qf-field-label">Option translations ({lang})</span>
                            <div className="fmb-qf-row-legend trans" aria-hidden="true">
                              <span className="fmb-qf-row-legend-spacer" />
                              <span>Source (English)</span>
                              <span>{lang} ({getNativeScript(lang)})</span>
                            </div>
                            <div className="fmb-qf-rows">
                              {(formData.options || []).map((opt, i) => {
                                const sourceText = (opt?.text || '').trim();
                                return (
                                  <div key={i} className="fmb-qf-row trans">
                                    <span className="fmb-qf-row-num" aria-hidden="true">{i + 1}</span>
                                    <div
                                      className={`fmb-qf-trans-source${sourceText ? '' : ' placeholder'}`}
                                      title={sourceText || `Option ${i + 1} (untranslated source)`}
                                    >
                                      {sourceText || <em>Option {i + 1}</em>}
                                    </div>
                                    <input
                                      type="text"
                                      value={langData.options?.[i]?.text || ''}
                                      onChange={(e) => handleTranslationOptionChange(lang, i, e.target.value)}
                                      placeholder={`${lang} translation`}
                                      className="fmb-qf-row-input"
                                      aria-label={`Option ${i + 1} translation in ${lang}`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {/* Settings */}
            <section className="fmb-qf-section" aria-labelledby="qf-settings-h">
              <header className="fmb-qf-section-head">
                <h3 id="qf-settings-h" className="fmb-qf-section-title">Settings</h3>
                <p className="fmb-qf-section-sub">
                  Behavior, validation rules, and optional media for this question.
                </p>
              </header>

              <div className="fmb-qf-grid cols-3">
                <div className="fmb-qf-field">
                  <label htmlFor="isMandatory" className="fmb-qf-field-label">Is Mandatory</label>
                  <select
                    id="isMandatory"
                    name="isMandatory"
                    value={formData.isMandatory}
                    onChange={handleChange}
                    disabled={mandatoryLockedByParent}
                    className="fmb-qf-field-select"
                    aria-invalid={errors.isMandatory ? 'true' : 'false'}
                    aria-describedby={mandatoryLockedByParent ? 'isMandatory-lock-note' : undefined}
                  >
                    {yesNoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  {mandatoryLockedByParent && (
                    <p id="isMandatory-lock-note" className="fmb-qf-lock-note">Disabled: {mandatoryLockReason}</p>
                  )}
                  {errors.isMandatory && <div className="fmb-qf-field-error">{errors.isMandatory}</div>}
                </div>

                <div className="fmb-qf-field">
                  <label htmlFor="isDynamic" className="fmb-qf-field-label">Is Dynamic</label>
                  <select
                    id="isDynamic"
                    name="isDynamic"
                    value={formData.isDynamic}
                    onChange={handleChange}
                    disabled={fieldConfig.isDynamic !== undefined}
                    className="fmb-qf-field-select"
                  >
                    {yesNoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  {fieldConfig.isDynamic !== undefined && <p className="fmb-qf-field-help">Auto-set based on question type</p>}
                </div>

                <div className="fmb-qf-field">
                  <label htmlFor="mode" className="fmb-qf-field-label">Mode</label>
                  <select
                    id="mode"
                    name="mode"
                    value={formData.mode}
                    onChange={handleChange}
                    className="fmb-qf-field-select"
                  >
                    <option value="None">None</option>
                    <option value="New Data">New Data</option>
                    <option value="Correction">Correction</option>
                    <option value="Delete Data">Delete Data</option>
                  </select>
                </div>
              </div>

              {fieldConfig.showTextInputType && (
                <div className="fmb-qf-grid cols-2">
                  <div className="fmb-qf-field">
                    <label htmlFor="textInputType" className="fmb-qf-field-label">Text Input Type</label>
                    <select
                      id="textInputType"
                      name="textInputType"
                      value={formData.textInputType}
                      onChange={handleChange}
                      disabled={Boolean(fieldConfig.textInputTypeValue)}
                      className="fmb-qf-field-select"
                    >
                      {textInputTypes.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>

                  {fieldConfig.showTextLimit && (
                    <div className="fmb-qf-field">
                      <label htmlFor="textLimitCharacters" className="fmb-qf-field-label">Text Limit (Characters)</label>
                      <input
                        type="number"
                        id="textLimitCharacters"
                        name="textLimitCharacters"
                        value={formData.textLimitCharacters}
                        onChange={handleChange}
                        placeholder="Default: 1024"
                        className="fmb-qf-field-input"
                      />
                    </div>
                  )}
                </div>
              )}

              {fieldConfig.showMaxMin && (
                <div className="fmb-qf-grid cols-2">
                  <div className="fmb-qf-field">
                    <label htmlFor="minValue" className="fmb-qf-field-label">Min Value</label>
                    <input
                      type="text"
                      id="minValue"
                      name="minValue"
                      value={formData.minValue}
                      onChange={handleChange}
                      placeholder="Minimum value"
                      className="fmb-qf-field-input"
                    />
                  </div>
                  <div className="fmb-qf-field">
                    <label htmlFor="maxValue" className="fmb-qf-field-label">Max Value</label>
                    <input
                      type="text"
                      id="maxValue"
                      name="maxValue"
                      value={formData.maxValue}
                      onChange={handleChange}
                      placeholder="Maximum value"
                      className="fmb-qf-field-input"
                      aria-invalid={errors.maxValue ? 'true' : 'false'}
                    />
                  </div>
                </div>
              )}

              <div className="fmb-qf-grid cols-2">
                <div className="fmb-qf-field">
                  <label htmlFor="questionMediaType" className="fmb-qf-field-label">Question Media Type</label>
                  <select
                    id="questionMediaType"
                    name="questionMediaType"
                    value={formData.questionMediaType}
                    onChange={handleChange}
                    disabled={Boolean(fieldConfig.questionMediaTypeValue)}
                    className="fmb-qf-field-select"
                  >
                    {questionMediaTypes.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>

                <div className="fmb-qf-field">
                  <label htmlFor="questionMediaLink" className="fmb-qf-field-label">Question Media Link</label>
                  <input
                    type="text"
                    id="questionMediaLink"
                    name="questionMediaLink"
                    value={formData.questionMediaLink}
                    onChange={handleChange}
                    placeholder="URL to media file"
                    disabled={formData.questionMediaType === 'None'}
                    className="fmb-qf-field-input"
                  />
                  {formData.questionMediaType === 'None' && <p className="fmb-qf-field-help">Disabled when Media Type is None</p>}
                </div>
              </div>
            </section>

            {/* Form actions */}
            <div className="fmb-qf-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={backToQuestions}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={loading}
                aria-busy={loading}
                data-testid="qf-submit"
              >
                {loading ? 'Saving…' : (isEdit ? 'Update Question' : 'Add Question')}
              </button>
            </div>
          </div>

          {/* ── Right column: live preview (sticky on desktop) ───────── */}
          <aside
            className="fmb-qf-summary"
            aria-label="Question preview"
            data-testid="qf-preview"
          >
            <div className="fmb-qf-summary-eyebrow">Preview</div>
            <div className="fmb-qf-summary-head">
              <span
                className={`fmb-qf-summary-id${preview.id ? '' : ' placeholder'}`}
                data-testid="qf-preview-id"
              >
                {preview.id || 'Q-id'}
              </span>
              {preview.isMandatory ? (
                <Badge status="live" dot={false}>Mandatory</Badge>
              ) : (
                <Badge status="draft" dot={false}>Optional</Badge>
              )}
            </div>
            <p
              className={`fmb-qf-summary-question${preview.description ? '' : ' placeholder'}`}
              data-testid="qf-preview-question"
            >
              {preview.description || 'Question text will appear here as you type.'}
            </p>
            <hr className="fmb-qf-summary-divider" />
            <div className="fmb-qf-summary-kv">
              <span className="fmb-qf-summary-kv-label">Type</span>
              <span className="fmb-qf-summary-kv-value" data-testid="qf-preview-type">
                {preview.type || '—'}
              </span>
            </div>
            <div className="fmb-qf-summary-kv">
              <span className="fmb-qf-summary-kv-label">Medium</span>
              <span className="fmb-qf-summary-tags">
                {preview.medium
                  ? <Chip>{preview.medium}</Chip>
                  : <span className="fmb-qf-summary-kv-value" style={{ color: 'var(--text-4, #9b9aa1)' }}>—</span>}
              </span>
            </div>
            {preview.showOptions && (
              <div className="fmb-qf-summary-kv">
                {/* Label intentionally "Option count" (singular) so it does
                    NOT match the lock-in test's /^Options/ query, which is
                    scoped to the Options section title. */}
                <span className="fmb-qf-summary-kv-label">Option count</span>
                <span className="fmb-qf-summary-kv-value" data-testid="qf-preview-options-count">
                  {preview.optionCount}
                </span>
              </div>
            )}
            {preview.showTable && (
              <div className="fmb-qf-summary-kv">
                <span className="fmb-qf-summary-kv-label">Row count</span>
                <span className="fmb-qf-summary-kv-value" data-testid="qf-preview-rows-count">
                  {preview.tableRowCount}
                </span>
              </div>
            )}
            {preview.parentId && (
              <div className="fmb-qf-summary-kv">
                <span className="fmb-qf-summary-kv-label">Parent</span>
                <span className="fmb-qf-summary-kv-value" data-testid="qf-preview-parent">
                  <span className="fmb-qf-mono">{preview.parentId}</span>
                </span>
              </div>
            )}
            <div className="fmb-qf-summary-kv">
              <span className="fmb-qf-summary-kv-label">Dynamic</span>
              <span className="fmb-qf-summary-kv-value">{preview.isDynamic ? 'Yes' : 'No'}</span>
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
};

export default QuestionForm;
