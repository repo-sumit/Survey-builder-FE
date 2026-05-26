import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { surveyAPI, questionAPI, exportAPI, publishAPI, lockAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import PageHeader from './ui/PageHeader';
import Icon from './ui/Icon';
import Badge from './ui/Badge';
import Chip from './ui/Chip';
import Segmented from './ui/Segmented';

const FEATURE_PUBLISH =
  (typeof process !== 'undefined' && process.env?.REACT_APP_FEATURE_PUBLISH === 'true') ||
  (typeof window !== 'undefined' && window.__ENV__?.FEATURE_PUBLISH === 'true');

/* ────────────────────────────────────────────────────────────
   QuestionList — Phase 7 design refresh.

   The data + lock lifecycle is byte-equivalent with the previous
   implementation:
   - useQuery(['survey', surveyId], surveyAPI.getById) — unchanged
   - useQuery(['questions', surveyId], questionAPI.getAll) — unchanged
   - lockAPI.acquire on mount + lockAPI.release on unmount — unchanged
   - sessionStorage('lastEditedQuestionId') scroll-restore — unchanged
   - useMutation for delete with same onSuccess invalidate + toast — unchanged
   - duplicate via window.prompt + questionAPI.duplicate — unchanged
   - export / publish / unpublish flows — unchanged
   - parent-question sort + child depth indent — unchanged
   - FEATURE_PUBLISH gate — unchanged
   - read-only + published role/state gating — unchanged

   The UI moves to fmb-ql-* tokenized classes. The .question-highlight
   class used by the scroll-restore effect is preserved (and reused
   alongside .fmb-ql-row in the new markup).
   ──────────────────────────────────────────────────────────── */

const TYPE_FILTER_OPTIONS = (types) => [
  { value: 'all', label: 'All types' },
  ...types.map(t => ({ value: t, label: t })),
];
const REQUIRED_FILTER_OPTIONS = [
  { value: 'all',       label: 'All' },
  { value: 'required',  label: 'Required' },
  { value: 'optional',  label: 'Optional' },
];

// Parse "Q1.2" → [1, 2] ; "Q3" → [3].  Identical to previous impl.
const parseQuestionSegments = (questionId) => {
  const cleaned = String(questionId || '').replace(/^Q/i, '');
  return cleaned.split('.').map(s => Number.parseInt(s, 10)).filter(n => !Number.isNaN(n));
};
const getQuestionDepth = (questionId) => {
  const segs = parseQuestionSegments(questionId);
  return Math.max(segs.length - 1, 0);
};
const normalizeQuestionId = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^q/i.test(trimmed)) return `Q${trimmed.slice(1)}`;
  if (/^\d+(\.\d+)*$/.test(trimmed)) return `Q${trimmed}`;
  return trimmed;
};

const QuestionList = () => {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lockInfo, setLockInfo] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [requiredFilter, setRequiredFilter] = useState('all');
  const questionListRef = useRef(null);

  const {
    data: survey,
    isLoading: surveyLoading,
    error: surveyError,
    refetch: refetchSurvey,
  } = useQuery({
    queryKey: ['survey', surveyId],
    queryFn: () => surveyAPI.getById(surveyId),
  });

  const {
    data: questions = [],
    isLoading: questionsLoading,
    isFetching: questionsFetching,
    error: questionsError,
    refetch: refetchQuestions,
  } = useQuery({
    queryKey: ['questions', surveyId],
    queryFn: () => questionAPI.getAll(surveyId),
  });

  const loading = surveyLoading || questionsLoading;
  const error = (surveyError || questionsError) ? 'Failed to load data' : null;

  const isReadOnly = user?.role !== 'admin' && !user?.isActive;
  const isPublished = survey?.publish?.status === 'PUBLISHED';

  /* ── Lock lifecycle (preserved verbatim) ───────────────────── */
  useEffect(() => {
    const acquireLock = async () => {
      try {
        const result = await lockAPI.acquire(surveyId);
        setLockInfo(result.lock || null);
      } catch (err) {
        if (err.response?.status === 409) {
          setLockInfo(err.response.data.lock || { locked: true });
        }
      }
    };
    acquireLock();
    return () => {
      lockAPI.release(surveyId).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  /* ── Scroll restore (preserved verbatim) ───────────────────── */
  useEffect(() => {
    const lastEditedId = sessionStorage.getItem('lastEditedQuestionId');
    if (lastEditedId && questions.length > 0) {
      sessionStorage.removeItem('lastEditedQuestionId');
      setTimeout(() => {
        const el = document.getElementById(`question-${lastEditedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('question-highlight');
          setTimeout(() => el.classList.remove('question-highlight'), 2000);
        }
      }, 100);
    }
  }, [questions]);

  /* ── Mutations (preserved verbatim) ────────────────────────── */
  const deleteMutation = useMutation({
    mutationFn: (questionId) => questionAPI.delete(surveyId, questionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questions', surveyId] }),
    onError: (err) => {
      const msg = err.response?.data?.error || 'Failed to delete question';
      toast.error(msg);
    },
  });

  const handleDelete = (questionId) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      deleteMutation.mutate(questionId);
    }
  };

  const handleDuplicate = async (questionId) => {
    const newQuestionId = window.prompt('Enter the new Question ID (example: 4 or Q4):');
    if (!newQuestionId) return;
    const normalizedQuestionId = normalizeQuestionId(newQuestionId);
    if (!normalizedQuestionId) {
      toast.error('Question ID is required.');
      return;
    }
    try {
      const duplicatedQuestion = await questionAPI.duplicate(surveyId, questionId, normalizedQuestionId);
      queryClient.invalidateQueries({ queryKey: ['questions', surveyId] });
      toast.success(`Question duplicated successfully as ${duplicatedQuestion.questionId}`);
      navigate(`/surveys/${surveyId}/questions/${duplicatedQuestion.questionId}/edit`);
    } catch (err) {
      const data = err.response?.data;
      let errorMessage = 'Failed to duplicate question';
      if (data?.message) errorMessage = data.message;
      else if (Array.isArray(data?.errors) && data.errors.length > 0) {
        errorMessage = data.errors.map(e => typeof e === 'string' ? e : e.message).filter(Boolean).join(' | ');
      } else if (data?.error) {
        errorMessage = data.error;
      }
      toast.error(errorMessage);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      await exportAPI.download(surveyId);
      toast.success('Excel file downloaded successfully');
    } catch (err) {
      toast.error('Failed to export survey');
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const handlePublish = async () => {
    if (!window.confirm('Are you sure you want to publish this survey? This will lock it from further edits.')) return;
    try {
      setPublishing(true);
      await publishAPI.publish(surveyId);
      queryClient.invalidateQueries({ queryKey: ['survey', surveyId] });
      toast.success('Survey published successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to publish survey');
    } finally {
      setPublishing(false);
    }
  };
  const handleUnpublish = async () => {
    if (!window.confirm('Are you sure you want to unpublish this survey?')) return;
    try {
      setPublishing(true);
      await publishAPI.unpublish(surveyId);
      queryClient.invalidateQueries({ queryKey: ['survey', surveyId] });
      toast.success('Survey unpublished successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to unpublish survey');
    } finally {
      setPublishing(false);
    }
  };

  /* ── Derived data ─────────────────────────────────────────── */
  // 1) Sort questions by ID (preserved parent-child logic)
  const sortedQuestions = useMemo(() => {
    return [...questions].sort((a, b) => {
      const aParts = parseQuestionSegments(a.questionId);
      const bParts = parseQuestionSegments(b.questionId);
      const maxLen = Math.max(aParts.length, bParts.length);
      for (let i = 0; i < maxLen; i += 1) {
        const aVal = aParts[i];
        const bVal = bParts[i];
        if (aVal === undefined) return -1;
        if (bVal === undefined) return 1;
        if (aVal !== bVal) return aVal - bVal;
      }
      return 0;
    });
  }, [questions]);

  // 2) Derived stats (real numbers from the loaded set)
  const stats = useMemo(() => {
    const total = questions.length;
    const required = questions.filter(q => q.isMandatory === 'Yes').length;
    const types = new Set(questions.map(q => q.questionType).filter(Boolean));
    // Languages: union of all translation keys across questions
    const langs = new Set();
    questions.forEach(q => {
      if (q.translations && typeof q.translations === 'object') {
        Object.keys(q.translations).forEach(k => langs.add(k));
      }
    });
    return { total, required, types: types.size, langs: langs.size, typesSet: types };
  }, [questions]);

  // 3) Translation coverage per language — only if survey defines languages
  //    AND at least one question has a non-empty translation entry for it.
  const coverage = useMemo(() => {
    if (!survey || !questions.length) return [];
    const surveyLangs = Array.isArray(survey.availableMediums)
      ? survey.availableMediums
      : typeof survey.availableMediums === 'string'
        ? survey.availableMediums.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    if (surveyLangs.length === 0) return [];
    return surveyLangs.map(lang => {
      const done = questions.filter(q => {
        const t = q?.translations?.[lang];
        return t && typeof t === 'object' && typeof t.questionDescription === 'string' && t.questionDescription.trim() !== '';
      }).length;
      const state = done === 0 ? 'empty' : done === questions.length ? 'done' : 'partial';
      return { lang, done, total: questions.length, state };
    });
  }, [survey, questions]);

  // 4) Filter + search
  const visibleQuestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedQuestions.filter(qq => {
      if (q) {
        const hay = `${qq.questionId || ''} ${qq.questionDescription || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter !== 'all' && qq.questionType !== typeFilter) return false;
      if (requiredFilter === 'required' && qq.isMandatory !== 'Yes') return false;
      if (requiredFilter === 'optional' && qq.isMandatory === 'Yes') return false;
      return true;
    });
  }, [sortedQuestions, search, typeFilter, requiredFilter]);

  const lockedByOther = lockInfo?.locked && lockInfo?.lockedBy && lockInfo.lockedBy !== user?.id;

  /* ── Loading state — branded skeleton ──────────────────────── */
  if (loading) {
    return (
      <div className="question-list-container" data-testid="qlist-loading">
        <PageHeader
          title="Question Master"
          sub="Loading survey and questions…"
          actions={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/')} data-testid="qlist-back">
              <Icon name="chevronLeft" /> Back to Surveys
            </button>
          }
        />
        <div className="fmb-ql-stats" aria-hidden="true">
          {[0, 1, 2, 3].map(i => <div key={i} className="fmb-ql-skel" style={{ height: 72 }} />)}
        </div>
        <div className="fmb-ql-rows">
          {[0, 1, 2, 3].map(i => <div key={i} className="fmb-ql-skel" style={{ height: 120 }} />)}
        </div>
      </div>
    );
  }

  /* ── Survey not found ─────────────────────────────────────── */
  if (!survey) {
    return (
      <div className="question-list-container" data-testid="qlist-survey-missing">
        <PageHeader
          title="Question Master"
          sub="We couldn't find that survey."
          actions={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/')} data-testid="qlist-back">
              <Icon name="chevronLeft" /> Back to Surveys
            </button>
          }
        />
        <div className="fmb-ql-error" role="alert">
          <Icon name="warn" size={16} />
          <span className="fmb-ql-error-msg">Survey not found</span>
        </div>
      </div>
    );
  }

  /* ── Header actions ───────────────────────────────────────── */
  const headerActions = (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => navigate('/')}
        data-testid="qlist-back"
      >
        <Icon name="chevronLeft" /> Back to Surveys
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => navigate(`/surveys/${surveyId}/preview`)}
        disabled={questions.length === 0}
        data-testid="qlist-preview"
      >
        <Icon name="info" size={13} /> Preview Survey
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={handleExport}
        disabled={exporting}
        data-testid="qlist-export"
      >
        {exporting ? 'Exporting…' : (<><Icon name="upload" size={13} /> Export to Excel</>)}
      </button>
      {FEATURE_PUBLISH && !isReadOnly && (
        isPublished ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleUnpublish}
            disabled={publishing}
            data-testid="qlist-unpublish"
          >
            {publishing ? 'Updating…' : 'Unpublish'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handlePublish}
            disabled={publishing || questions.length === 0}
            data-testid="qlist-publish"
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        )
      )}
      {!isReadOnly && !isPublished && (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => navigate(`/surveys/${surveyId}/questions/new`)}
          data-testid="qlist-add-cta"
        >
          <Icon name="plus" /> Add Question
        </button>
      )}
    </>
  );

  return (
    <div className="question-list-container">
      <PageHeader
        eyebrow={survey.surveyId}
        title="Question Master"
        sub={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{survey.surveyName}</span>
            {isPublished && <Badge status="live">Published</Badge>}
          </span>
        }
        actions={headerActions}
      />

      {lockedByOther && (
        <div className="fmb-ql-banner warn" role="alert" data-testid="qlist-lock-banner">
          <Icon name="warn" size={16} />
          <div>
            Another user is editing this survey. Changes are restricted until they finish.
          </div>
        </div>
      )}

      {isReadOnly && (
        <div className="fmb-ql-banner info" role="status" data-testid="qlist-readonly-banner">
          <Icon name="info" size={16} />
          <div>Your account is read-only — view-only access to questions.</div>
        </div>
      )}

      {error && (
        <div className="fmb-ql-error" role="alert" data-testid="qlist-error">
          <Icon name="warn" size={16} />
          <span className="fmb-ql-error-msg">{error}</span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={questionsFetching}
            onClick={() => { refetchSurvey(); refetchQuestions(); }}
            data-testid="qlist-error-retry"
          >
            {questionsFetching ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {/* Derived stats — real numbers only */}
      <div className="fmb-ql-stats" data-testid="qlist-stats">
        <Stat label="Questions"          value={stats.total} />
        <Stat label="Required"           value={stats.required}
              hint={stats.total ? `${Math.round((stats.required / stats.total) * 100)}% of total` : '0%'} />
        <Stat label="Question types"     value={stats.types} hint={stats.types === 1 ? 'type used' : 'types used'} />
        <Stat label="Languages covered"  value={stats.langs} hint={stats.langs === 1 ? 'language' : 'languages'} />
      </div>

      {/* Translation coverage — derived from real question.translations */}
      {coverage.length > 0 && (
        <div className="fmb-ql-coverage" data-testid="qlist-coverage">
          <div className="fmb-ql-coverage-head">
            <span className="fmb-ql-coverage-eyebrow">Translation coverage</span>
            <span className="fmb-ql-coverage-title">{questions.length} {questions.length === 1 ? 'question' : 'questions'} across {coverage.length} {coverage.length === 1 ? 'language' : 'languages'}</span>
          </div>
          <div className="fmb-ql-coverage-list">
            {coverage.map(c => (
              <span
                key={c.lang}
                className="fmb-ql-coverage-chip"
                data-state={c.state}
                title={`${c.done} of ${c.total} questions translated to ${c.lang}`}
              >
                <span>{c.lang}</span>
                <span className="ratio">{c.done}/{c.total}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="fmb-ql-toolbar">
        <div className="fmb-search-box">
          <Icon name="search" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by question ID or text…"
            aria-label="Search questions"
            data-testid="qlist-search"
          />
        </div>
        {stats.typesSet.size > 1 && (
          <select
            className="fmb-sl-sort"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by question type"
            data-testid="qlist-type-filter"
          >
            {TYPE_FILTER_OPTIONS([...stats.typesSet]).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
        <Segmented
          value={requiredFilter}
          onChange={setRequiredFilter}
          ariaLabel="Filter by required"
          options={REQUIRED_FILTER_OPTIONS}
        />
        <div className="fmb-ql-spacer" />
        <span className="fmb-ql-toolbar-summary" data-testid="qlist-summary">
          Showing {visibleQuestions.length} of {questions.length}
        </span>
      </div>

      {/* Empty / filtered-empty / rows */}
      {questions.length === 0 ? (
        <div className="fmb-ql-empty" data-testid="qlist-empty">
          <div className="fmb-ql-empty-icon"><Icon name="layout" size={22} /></div>
          <p className="fmb-ql-empty-title">No questions yet</p>
          <p className="fmb-ql-empty-sub">
            {isReadOnly || isPublished
              ? 'There are no questions in this survey yet.'
              : 'Add your first question to start building this survey.'}
          </p>
          {!isReadOnly && !isPublished && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => navigate(`/surveys/${surveyId}/questions/new`)}
              data-testid="qlist-empty-add-cta"
            >
              <Icon name="plus" /> Add Question
            </button>
          )}
        </div>
      ) : visibleQuestions.length === 0 ? (
        <div className="fmb-ql-empty" data-testid="qlist-filtered-empty">
          <p className="fmb-ql-empty-title">No questions match your filters</p>
          <p className="fmb-ql-empty-sub">Try clearing the search or switching back to "All".</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => { setSearch(''); setTypeFilter('all'); setRequiredFilter('all'); }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="fmb-ql-rows" ref={questionListRef} data-testid="qlist-rows">
          {visibleQuestions.map((question) => (
            <QuestionRow
              key={question.questionId}
              question={question}
              isReadOnly={isReadOnly}
              isPublished={isPublished}
              onEdit={() => navigate(`/surveys/${surveyId}/questions/${question.questionId}/edit`)}
              onDuplicate={() => handleDuplicate(question.questionId)}
              onDelete={() => handleDelete(question.questionId)}
              deleteBusy={deleteMutation.isPending && deleteMutation.variables === question.questionId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Sub-components ──────────────────────────────────────────── */

const Stat = ({ label, value, hint }) => (
  <div className="fmb-ql-stat">
    <div className="fmb-ql-stat-label">{label}</div>
    <div className="fmb-ql-stat-value">{value}</div>
    {hint != null && <div className="fmb-ql-stat-hint">{hint}</div>}
  </div>
);

const QuestionRow = ({ question, isReadOnly, isPublished, onEdit, onDuplicate, onDelete, deleteBusy }) => {
  const depth = getQuestionDepth(question.questionId);
  const showOptions = Array.isArray(question.options) && question.options.length > 0;
  const showTable =
    question.tableQuestionValue &&
    ['Tabular Text Input', 'Tabular Drop Down', 'Tabular Check Box'].includes(question.questionType);
  const showEnglish =
    question.questionDescriptionInEnglish &&
    question.questionDescriptionInEnglish !== question.questionDescription;

  return (
    <article
      id={`question-${question.questionId}`}
      className={`fmb-ql-row${depth > 0 ? ' child-question' : ''}`}
      style={{ '--question-depth': depth }}
      data-testid="question-row"
      data-question-id={question.questionId}
    >
      <div className="fmb-ql-row-no" aria-hidden="true">{question.questionId}</div>
      <div className="fmb-ql-row-body">
        <header className="fmb-ql-row-head">
          <Chip variant="brand">{question.questionType || 'Unknown'}</Chip>
          {question.isMandatory === 'Yes' && <Chip variant="accent">Required</Chip>}
          {question.sourceQuestion && (
            <span style={{ fontSize: 11.5, color: 'var(--text-3, #6b6b73)' }}>
              child of <strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{question.sourceQuestion}</strong>
            </span>
          )}
          <div className="fmb-ql-row-actions">
            {!isReadOnly && !isPublished ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onEdit}
                  aria-label={`Edit question ${question.questionId}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onDuplicate}
                  aria-label={`Duplicate question ${question.questionId}`}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={onDelete}
                  disabled={deleteBusy}
                  aria-label={`Delete question ${question.questionId}`}
                >
                  {deleteBusy ? 'Deleting…' : 'Delete'}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onEdit}
                aria-label={`View question ${question.questionId}`}
              >
                View
              </button>
            )}
          </div>
        </header>

        <p className="fmb-ql-row-text">{question.questionDescription || <em style={{ color: 'var(--text-4, #9b9aa1)' }}>No question text</em>}</p>

        {showEnglish && (
          <p className="fmb-ql-row-english">English: {question.questionDescriptionInEnglish}</p>
        )}

        {showOptions && (
          <div className="fmb-ql-row-options">
            <strong>Options · {question.options.length}</strong>
            <div className="fmb-ql-row-options-list">
              {question.options.map((opt, idx) => (
                <span key={idx} className="fmb-ql-option-pill">
                  {opt.text}
                  {opt.children && (
                    <>
                      <span className="arrow">→</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{opt.children}</span>
                    </>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {showTable && (
          <div className="fmb-ql-row-table">
            <strong style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3, #6b6b73)' }}>
              Table questions
            </strong>
            <pre>{question.tableQuestionValue}</pre>
          </div>
        )}

        <div className="fmb-ql-row-meta">
          {question.medium && <Chip>Lang: {question.medium}</Chip>}
          {question.textInputType && question.textInputType !== 'None' && (
            <Chip>Input: {question.textInputType}</Chip>
          )}
        </div>
      </div>
    </article>
  );
};

export default QuestionList;
