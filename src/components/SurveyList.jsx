import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { surveyAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import DuplicateSurveyModal from './DuplicateSurveyModal';
import { useToast } from './Toast';
import PageHeader from './ui/PageHeader';
import Badge from './ui/Badge';
import Chip from './ui/Chip';
import Segmented from './ui/Segmented';
import Icon from './ui/Icon';

/* ────────────────────────────────────────────────────────────
   SurveyList — Phase 5 design refresh.

   Data layer is byte-equivalent with the previous implementation:
   - useQuery(['surveys'], surveyAPI.getAll) — exact same key + fn
   - delete + duplicate mutations preserve their onSuccess/onError
     contracts so cache invalidation and toasts keep working.
   - isReadOnly mirrors the previous semantics (only non-admin
     inactive users are locked out of mutating actions).

   The UI moves to fmb-* tokens + primitives. Existing App.css
   classes (.btn family) are still used for the per-card actions
   so we don't have to skin every button variant from scratch.
   ────────────────────────────────────────────────────────────*/

const FILTER_OPTIONS = [
  { value: 'all',         label: 'All' },
  { value: 'active',      label: 'Active' },
  { value: 'inactive',    label: 'Inactive' },
  { value: 'published',   label: 'Published' },
  { value: 'draft',       label: 'Draft' },
];

const SORT_OPTIONS = [
  { value: 'default',  label: 'Default order' },
  { value: 'name-asc', label: 'Name (A → Z)' },
  { value: 'name-desc',label: 'Name (Z → A)' },
  { value: 'id-asc',   label: 'Survey ID (A → Z)' },
];

const isPublished = (s) => s?.publish?.status === 'PUBLISHED';
const isActiveYes = (s) => s?.isActive === 'Yes';

const mediumsToArray = (m) => {
  if (Array.isArray(m)) return m.filter(Boolean);
  if (typeof m === 'string') return m.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};

const SurveyList = () => {
  const [duplicatingModal, setDuplicatingModal] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('default');

  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const isReadOnly = user?.role !== 'admin' && !user?.isActive;

  /* ── Data ─────────────────────────────────────────────────── */
  const {
    data: surveys = [],
    isLoading: loading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['surveys'],
    queryFn: surveyAPI.getAll,
  });

  const errorMessage = queryError ? 'Failed to load surveys' : null;

  const deleteMutation = useMutation({
    mutationFn: (surveyId) => surveyAPI.delete(surveyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['surveys'] }),
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Failed to delete survey');
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
      toast.error(err?.response?.data?.error || 'Failed to duplicate survey');
    },
  });

  /* ── Handlers ─────────────────────────────────────────────── */
  const handleDelete = (surveyId) => {
    // window.confirm preserved from previous behavior — Playwright/manual
    // QA expects the native dialog. Replacing this is out of scope for
    // Phase 5.
    if (window.confirm('Delete this survey? All associated questions will also be deleted.')) {
      deleteMutation.mutate(surveyId);
    }
  };
  const handleDuplicate = (survey) => setDuplicatingModal(survey);
  const handleDuplicateConfirm = (newSurveyId) =>
    duplicateMutation.mutate({ surveyId: duplicatingModal.surveyId, newSurveyId });

  /* Card spotlight — preserved from previous implementation; pure CSS
     custom-property write, no React state. */
  const handleCardMouseMove = useCallback((e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  }, []);

  /* ── Derived stats (real data only — no fakes) ────────────── */
  const stats = useMemo(() => {
    const total      = surveys.length;
    const active     = surveys.filter(isActiveYes).length;
    const published  = surveys.filter(isPublished).length;
    const langs = new Set();
    surveys.forEach((s) => mediumsToArray(s.availableMediums).forEach((l) => langs.add(l)));
    return { total, active, published, langs: langs.size };
  }, [surveys]);

  /* ── Derived list (filter + search + sort) ────────────────── */
  const visibleSurveys = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = surveys.filter((s) => {
      if (q && !(`${s.surveyName || ''} ${s.surveyId || ''}`.toLowerCase().includes(q))) return false;
      if (filter === 'active')    return isActiveYes(s);
      if (filter === 'inactive')  return !isActiveYes(s);
      if (filter === 'published') return isPublished(s);
      if (filter === 'draft')     return !isPublished(s);
      return true;
    });
    if (sort === 'name-asc')  list = [...list].sort((a, b) => String(a.surveyName || '').localeCompare(String(b.surveyName || '')));
    if (sort === 'name-desc') list = [...list].sort((a, b) => String(b.surveyName || '').localeCompare(String(a.surveyName || '')));
    if (sort === 'id-asc')    list = [...list].sort((a, b) => String(a.surveyId || '').localeCompare(String(b.surveyId || '')));
    return list;
  }, [surveys, search, filter, sort]);

  /* ── Loading state ────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="survey-list-container" data-testid="surveys-loading">
        <PageHeader
          title="Surveys"
          sub="Create and manage surveys with automatic Excel export."
        />
        <div className="fmb-sl-stats" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="fmb-sl-stat fmb-sl-skeleton" style={{ height: 84 }} />
          ))}
        </div>
        <div className="fmb-sl-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="fmb-sl-skeleton fmb-sl-skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="survey-list-container">
      <PageHeader
        eyebrow={user?.role === 'admin' ? 'ADMIN VIEW' : (user?.stateCode ? `STATE · ${user.stateCode}` : null)}
        title="Surveys"
        sub="Author, translate and publish field surveys. Excel import/export is built in."
        actions={
          !isReadOnly && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/import')}
                data-testid="surveys-import-cta"
              >
                <Icon name="upload" /> Import
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => navigate('/surveys/new')}
                data-testid="surveys-create-cta"
              >
                <Icon name="plus" /> Create Survey
              </button>
            </>
          )
        }
      />

      {isReadOnly && (
        <div className="fmb-sl-readonly" role="status" data-testid="surveys-readonly-banner">
          <Icon name="info" size={14} />
          <span>Your account is read-only — contact an admin to enable edits.</span>
        </div>
      )}

      {errorMessage && (
        <div className="fmb-sl-error" role="alert" data-testid="surveys-error">
          <Icon name="warn" size={16} />
          <span className="fmb-sl-error-msg">{errorMessage}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="surveys-error-retry"
          >
            {isFetching ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {/* Derived stats — none of these are made up. If `availableMediums`
          is missing across the board, `langs` legitimately reports 0. */}
      <div className="fmb-sl-stats" data-testid="surveys-stats">
        <Stat label="Total surveys"  value={stats.total} />
        <Stat label="Active"         value={stats.active}    hint={`${stats.total - stats.active} inactive`} />
        <Stat label="Published"      value={stats.published} hint={`${stats.total - stats.published} draft`} />
        <Stat label="Languages covered" value={stats.langs}  hint={stats.langs === 1 ? 'language' : 'languages'} />
      </div>

      {/* Toolbar */}
      <div className="fmb-sl-toolbar">
        <div className="fmb-search-box" style={{ maxWidth: 320 }}>
          <Icon name="search" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search surveys by name or ID…"
            aria-label="Search surveys"
            data-testid="surveys-search"
          />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter surveys by status"
          options={FILTER_OPTIONS}
        />
        <div className="fmb-sl-spacer" />
        <label htmlFor="surveys-sort" style={{ fontSize: 12, color: 'var(--text-3, #6b6b73)' }}>Sort</label>
        <select
          id="surveys-sort"
          className="fmb-sl-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          data-testid="surveys-sort"
          aria-label="Sort surveys"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Empty / filtered-empty / grid */}
      {surveys.length === 0 ? (
        <div className="fmb-sl-empty" data-testid="surveys-empty">
          <div className="fmb-sl-empty-icon"><Icon name="layout" size={22} /></div>
          <p className="fmb-sl-empty-title">No surveys yet</p>
          <p className="fmb-sl-empty-sub">
            {isReadOnly
              ? 'Once an admin invites you with edit access, your state surveys will appear here.'
              : 'Get started by creating a survey from scratch or importing an existing workbook.'}
          </p>
          {!isReadOnly && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/import')}
              >
                <Icon name="upload" /> Import
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => navigate('/surveys/new')}
                data-testid="surveys-empty-create-cta"
              >
                <Icon name="plus" /> Create Survey
              </button>
            </div>
          )}
        </div>
      ) : visibleSurveys.length === 0 ? (
        <div className="fmb-sl-empty" data-testid="surveys-filtered-empty">
          <p className="fmb-sl-empty-title">No surveys match your filters</p>
          <p className="fmb-sl-empty-sub">Try clearing the search or switching to "All".</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => { setSearch(''); setFilter('all'); }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="fmb-sl-grid" data-testid="surveys-grid">
          {visibleSurveys.map((survey) => (
            <SurveyCard
              key={survey.surveyId}
              survey={survey}
              isReadOnly={isReadOnly}
              onMouseMove={handleCardMouseMove}
              onQuestions={() => navigate(`/surveys/${survey.surveyId}/questions`)}
              onPreview={() => navigate(`/surveys/${survey.surveyId}/preview`)}
              onEdit={() => navigate(`/surveys/${survey.surveyId}/edit`)}
              onDuplicate={() => handleDuplicate(survey)}
              onDelete={() => handleDelete(survey.surveyId)}
              deleteBusy={deleteMutation.isPending && deleteMutation.variables === survey.surveyId}
            />
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

/* ── Sub-components ─────────────────────────────────────────── */

const Stat = ({ label, value, hint }) => (
  <div className="fmb-sl-stat">
    <div className="fmb-sl-stat-label">{label}</div>
    <div className="fmb-sl-stat-value">{value}</div>
    {hint != null && <div className="fmb-sl-stat-hint">{hint}</div>}
  </div>
);

const SurveyCard = ({
  survey,
  isReadOnly,
  onMouseMove,
  onQuestions,
  onPreview,
  onEdit,
  onDuplicate,
  onDelete,
  deleteBusy,
}) => {
  const published = isPublished(survey);
  const active = isActiveYes(survey);

  return (
    <article
      className="fmb-sl-card"
      onMouseMove={onMouseMove}
      data-testid="survey-card"
      data-survey-id={survey.surveyId}
    >
      <span className="fmb-sl-card-accent" aria-hidden="true" />

      <div className="fmb-sl-card-head">
        <div className="fmb-sl-card-meta-row">
          <Badge status={published ? 'live' : 'draft'}>
            {published ? 'Published' : 'Draft'}
          </Badge>
          <Badge status={active ? 'live' : 'locked'} dot={false}>
            {active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="fmb-sl-card-meta-row">
          {survey.stateCode && <Chip variant="brand">{survey.stateCode}</Chip>}
          {survey.mode && <Chip>{survey.mode}</Chip>}
        </div>
      </div>

      <div>
        <h3 className="fmb-sl-card-title" title={survey.surveyName}>{survey.surveyName || 'Untitled survey'}</h3>
        <div className="fmb-sl-card-id">{survey.surveyId}</div>
      </div>

      {survey.surveyDescription && (
        <p className="fmb-sl-card-desc">{survey.surveyDescription}</p>
      )}

      <div className="fmb-sl-card-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onQuestions} aria-label={`Open question master for ${survey.surveyName || survey.surveyId}`}>
          Question Master
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onPreview} aria-label={`Preview ${survey.surveyName || survey.surveyId}`}>
          Preview
        </button>
        {!isReadOnly && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onDuplicate} aria-label={`Duplicate ${survey.surveyName || survey.surveyId}`}>
              Duplicate
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit} aria-label={`Edit ${survey.surveyName || survey.surveyId}`}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={onDelete}
              disabled={published || deleteBusy}
              title={published ? 'Cannot delete a published survey' : 'Delete this survey'}
              aria-label={`Delete ${survey.surveyName || survey.surveyId}`}
            >
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </button>
          </>
        )}
      </div>
    </article>
  );
};

export default SurveyList;
