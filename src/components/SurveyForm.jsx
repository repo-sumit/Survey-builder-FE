import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { surveyAPI, designationAPI } from '../services/api';
import { useValidation } from '../hooks/useValidation';
import { useToast } from './Toast';
import { AVAILABLE_MEDIUMS } from '../schemas/validationConstants';
import PageHeader from './ui/PageHeader';
import Icon from './ui/Icon';
import Badge from './ui/Badge';
import Chip from './ui/Chip';

/* ────────────────────────────────────────────────────────────────
   SurveyForm — Phase 6 design refresh.

   The data layer is byte-equivalent with the previous implementation:
   - useValidation hook is reused as-is.
   - surveyAPI.getById / .create / .update are called with identical
     payloads (availableMediums joined back to a comma-string on submit;
     hierarchicalAccessLevel joined with auto-included level 99).
   - designationAPI.getAll({ activeOnly: true }) drives the hierarchy
     dropdown — no hardcoded prototype values.
   - react-datepicker is preserved per Phase 6 brief; the
     DD/MM/YYYY HH:MM:SS format with auto-time-of-day per field is
     preserved verbatim.
   - Navigation after save: /surveys/:id/questions on create, / on edit.
   - Toast wiring + submit guards + error mapping all preserved.

   The UI moves to a two-column shell (form + sticky summary) using
   the fmb-sf-* token-driven classes added to ui.css.
   ──────────────────────────────────────────────────────────────── */

const EMPTY_FORM = {
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
};

const YES_NO_OPTIONS = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No',  label: 'No'  }
];

const MODE_OPTIONS = ['None', 'New Data', 'Correction', 'Delete Data'];

// Format a Date -> "DD/MM/YYYY HH:MM:SS" — auto-times preserved per field.
const formatDateString = (date, field) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  if (field === 'launchDate') return `${day}/${month}/${year} 00:00:00`;
  if (field === 'closeDate')  return `${day}/${month}/${year} 23:59:59`;
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${h}:${m}:${s}`;
};

// Parse "DD/MM/YYYY HH:MM:SS" -> Date — handles missing time.
const parseDateString = (dateString) => {
  if (!dateString) return null;
  try {
    const [datePart, timePart] = dateString.split(' ');
    const [day, month, year] = datePart.split('/').map(Number);
    if (timePart) {
      const [hours, minutes, seconds] = timePart.split(':').map(Number);
      return new Date(year, month - 1, day, hours, minutes, seconds);
    }
    return new Date(year, month - 1, day);
  } catch {
    return null;
  }
};

const SurveyForm = () => {
  const navigate = useNavigate();
  const { surveyId } = useParams();
  const isEdit = Boolean(surveyId);
  const { errors, validateSurvey, setErrors } = useValidation();
  const toast = useToast();

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);                  // submit in flight
  const [initialLoading, setInitialLoading] = useState(isEdit);   // edit-mode fetch in flight
  const [loadError, setLoadError] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  // Designation multi-select state
  const [designations, setDesignations] = useState([]);
  const [selectedLevels, setSelectedLevels] = useState([]);
  const [showHierarchyDropdown, setShowHierarchyDropdown] = useState(false);
  const hierarchyDropdownRef = useRef(null);

  // Medium (language) dropdown state
  const [showMediumDropdown, setShowMediumDropdown] = useState(false);
  const mediumDropdownRef = useRef(null);

  /* ── Outside-click for both dropdowns ───────────────────────── */
  useEffect(() => {
    const onClickOutside = (e) => {
      if (mediumDropdownRef.current && !mediumDropdownRef.current.contains(e.target)) {
        setShowMediumDropdown(false);
      }
      if (hierarchyDropdownRef.current && !hierarchyDropdownRef.current.contains(e.target)) {
        setShowHierarchyDropdown(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  /* ── Designation load (preserved: seed level 99 silently if missing) ── */
  useEffect(() => {
    designationAPI.getAll({ activeOnly: true })
      .then(data => {
        setDesignations(data || []);
        const has99 = (data || []).some(d => String(d.hierarchy_level) === '99');
        if (!has99) designationAPI.seedDefaults().catch(() => {});
      })
      .catch(() => {});
  }, []);

  /* ── Edit-mode survey load ──────────────────────────────────── */
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        setInitialLoading(true);
        setLoadError(null);
        const data = await surveyAPI.getById(surveyId);
        if (cancelled) return;
        // availableMediums may come back as either string or array.
        if (typeof data.availableMediums === 'string') {
          data.availableMediums = data.availableMediums ? data.availableMediums.split(',') : [];
        }
        setFormData({ ...EMPTY_FORM, ...data });
        if (data.hierarchicalAccessLevel) {
          setSelectedLevels(
            data.hierarchicalAccessLevel.split(',').map(l => l.trim()).filter(Boolean)
          );
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError('Failed to load survey');
        toast.error('Failed to load survey');
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  /* ── Field change handlers ──────────────────────────────────── */
  const clearError = (name) => {
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    clearError(name);
  };

  const toggleMedium = (medium) => {
    const current = Array.isArray(formData.availableMediums) ? formData.availableMediums : [];
    const next = current.includes(medium) ? current.filter(m => m !== medium) : [...current, medium];
    setFormData(prev => ({ ...prev, availableMediums: next }));
    clearError('availableMediums');
  };
  const removeMedium = (medium) => {
    setFormData(prev => ({ ...prev, availableMediums: prev.availableMediums.filter(m => m !== medium) }));
  };

  const handleDateChange = (date, field) => {
    setFormData(prev => ({ ...prev, [field]: date ? formatDateString(date, field) : '' }));
    clearError(field);
  };

  const toggleHierarchyLevel = (levelStr) => {
    setSelectedLevels(prev => {
      const next = prev.includes(levelStr) ? prev.filter(l => l !== levelStr) : [...prev, levelStr];
      if (!next.includes('99')) next.push('99');                  // always-on by contract
      setFormData(fd => ({ ...fd, hierarchicalAccessLevel: next.join(',') }));
      return next;
    });
  };
  const removeHierarchyLevel = (levelStr) => {
    if (levelStr === '99') return;
    setSelectedLevels(prev => {
      const next = prev.filter(l => l !== levelStr);
      setFormData(fd => ({ ...fd, hierarchicalAccessLevel: next.join(',') }));
      return next;
    });
  };

  /* ── Submit ─────────────────────────────────────────────────── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;                                          // guard against double-submit
    setSubmitError(null);
    setErrors({});

    // Required-fields gate first (matches previous behavior + messages).
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

    if (!validateSurvey(formData)) {
      setSubmitError('Please fix all validation errors before submitting');
      return;
    }

    try {
      setLoading(true);
      const levelsToSave = [...new Set([...selectedLevels, '99'])];
      const dataToSend = {
        ...formData,
        availableMediums: Array.isArray(formData.availableMediums)
          ? formData.availableMediums.join(',')
          : formData.availableMediums,
        hierarchicalAccessLevel: levelsToSave.join(',')
      };

      if (isEdit) {
        await surveyAPI.update(surveyId, dataToSend);
        toast.success('Survey updated successfully');
        navigate('/');
      } else {
        const response = await surveyAPI.create(dataToSend);
        toast.success('Survey created successfully! You can now add questions.');
        navigate(`/surveys/${response.surveyId}/questions`);
      }
    } catch (err) {
      console.error('Survey submission error:', err);

      // Same backend-error mapping as before — preserve verbatim.
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        const errorMessages = err.response.data.errors;
        setSubmitError(errorMessages.join(' | '));
        const fieldErrors = {};
        errorMessages.forEach(msg => {
          const lower = msg.toLowerCase();
          if (lower.includes('survey id')) fieldErrors.surveyId = msg;
          else if (lower.includes('survey name')) fieldErrors.surveyName = msg;
          else if (lower.includes('survey description')) fieldErrors.surveyDescription = msg;
          else if (lower.includes('available mediums') || lower.includes('language')) fieldErrors.availableMediums = msg;
          else if (lower.includes('launch date')) fieldErrors.launchDate = msg;
          else if (lower.includes('close date')) fieldErrors.closeDate = msg;
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

  /* ── Submit-button disabled condition (preserved from prior code) ── */
  const submitDisabled =
    loading ||
    !formData.surveyId ||
    !formData.surveyName ||
    !formData.surveyDescription ||
    !formData.availableMediums ||
    formData.availableMediums.length === 0 ||
    Object.keys(errors).length > 0;

  /* ── Edit-mode load error state ─────────────────────────────── */
  if (loadError && isEdit) {
    return (
      <div className="survey-form-container" data-testid="surveyform-load-error">
        <PageHeader
          title="Edit survey"
          sub="We couldn't load this survey."
          actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>Back to surveys</button>}
        />
        <div className="fmb-sl-error" role="alert">
          <Icon name="warn" size={16} />
          <span className="fmb-sl-error-msg">{loadError}</span>
          <button type="button" className="btn btn-sm" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }

  /* ── Edit-mode skeleton ─────────────────────────────────────── */
  if (initialLoading && isEdit) {
    return (
      <div className="survey-form-container" data-testid="surveyform-loading">
        <PageHeader title="Edit survey" sub="Loading survey details…" />
        <div className="fmb-sf-shell">
          <div className="fmb-sf-main">
            {[0, 1, 2].map(i => (
              <div key={i} className="fmb-sf-skel" style={{ height: 180, borderRadius: 14 }} />
            ))}
          </div>
          <div className="fmb-sf-skel" style={{ height: 240, borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="survey-form-container">
      <PageHeader
        eyebrow={isEdit ? 'EDIT' : 'NEW'}
        title={isEdit ? 'Edit survey' : 'Create survey'}
        sub={isEdit
          ? 'Update the metadata, audience, and run window for this survey.'
          : 'Define the metadata, audience, and run window. You can add questions next.'}
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/')}
            data-testid="surveyform-back"
          >
            <Icon name="chevronLeft" /> Back to Surveys
          </button>
        }
      />

      {/* Submit + cross-field error summary — preserved behavior. */}
      {(submitError || Object.keys(errors).length > 0) && (
        <div className="fmb-sf-error-banner" role="alert" data-testid="surveyform-error-summary">
          {submitError && (
            <div>
              <span className="fmb-sf-error-banner-title">Error: </span>{submitError}
            </div>
          )}
          {Object.keys(errors).length > 0 && (
            <>
              <div className="fmb-sf-error-banner-title">Please fix the following:</div>
              <ul>
                {Object.entries(errors).map(([field, message]) => (
                  <li key={field}>{message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="fmb-sf-shell">
          {/* ── Left column: section cards ───────────────────── */}
          <div className="fmb-sf-main">
            {/* Basics */}
            <section className="fmb-sf-section" aria-labelledby="sf-basics-h">
              <header className="fmb-sf-section-head">
                <h3 id="sf-basics-h" className="fmb-sf-section-title">Basics</h3>
                <p className="fmb-sf-section-sub">Identifier, name, and a short description. Survey ID is permanent once created.</p>
              </header>

              <div className="fmb-sf-field">
                <label htmlFor="surveyId" className="fmb-sf-field-label">
                  Survey ID <span className="fmb-sf-field-required">*</span>
                  <span className="fmb-sf-field-help fmb-sf-mono" style={{ marginLeft: 8 }}>· {'^[A-Za-z0-9_]+$'}</span>
                </label>
                <input
                  id="surveyId"
                  name="surveyId"
                  type="text"
                  className="fmb-sf-field-input fmb-sf-mono"
                  value={formData.surveyId}
                  onChange={handleChange}
                  disabled={isEdit}
                  placeholder="e.g. UK_SEC_INF_01"
                  aria-invalid={errors.surveyId ? 'true' : 'false'}
                  data-testid="surveyform-survey-id"
                />
                {errors.surveyId && <div className="fmb-sf-field-error">{errors.surveyId}</div>}
                <p className="fmb-sf-field-help">Alphanumeric and underscores only. Locked after creation.</p>
              </div>

              <div className="fmb-sf-field">
                <label htmlFor="surveyName" className="fmb-sf-field-label">
                  Survey name <span className="fmb-sf-field-required">*</span>
                </label>
                <input
                  id="surveyName"
                  name="surveyName"
                  type="text"
                  className="fmb-sf-field-input"
                  value={formData.surveyName}
                  onChange={handleChange}
                  maxLength={99}
                  placeholder="e.g. Secondary Schools Infrastructure Survey"
                  aria-invalid={errors.surveyName ? 'true' : 'false'}
                  data-testid="surveyform-survey-name"
                />
                {errors.surveyName && <div className="fmb-sf-field-error">{errors.surveyName}</div>}
                <p className="fmb-sf-field-help">{(formData.surveyName || '').length}/99 characters</p>
              </div>

              <div className="fmb-sf-field">
                <label htmlFor="surveyDescription" className="fmb-sf-field-label">
                  Description <span className="fmb-sf-field-required">*</span>
                </label>
                <textarea
                  id="surveyDescription"
                  name="surveyDescription"
                  rows={4}
                  className="fmb-sf-field-textarea"
                  value={formData.surveyDescription}
                  onChange={handleChange}
                  maxLength={256}
                  placeholder="A short purpose statement for your team."
                  aria-invalid={errors.surveyDescription ? 'true' : 'false'}
                  data-testid="surveyform-survey-description"
                />
                {errors.surveyDescription && <div className="fmb-sf-field-error">{errors.surveyDescription}</div>}
                <p className="fmb-sf-field-help">{(formData.surveyDescription || '').length}/256 characters</p>
              </div>
            </section>

            {/* Audience */}
            <section className="fmb-sf-section" aria-labelledby="sf-audience-h">
              <header className="fmb-sf-section-head">
                <h3 id="sf-audience-h" className="fmb-sf-section-title">Audience</h3>
                <p className="fmb-sf-section-sub">Languages and hierarchical access levels for this survey.</p>
              </header>

              <div className="fmb-sf-field">
                <span className="fmb-sf-field-label">
                  Languages <span className="fmb-sf-field-required">*</span>
                </span>
                <div className="fmb-sf-multiselect" ref={mediumDropdownRef}>
                  <button
                    type="button"
                    className="fmb-sf-multiselect-trigger"
                    onClick={() => setShowMediumDropdown(v => !v)}
                    aria-expanded={showMediumDropdown}
                    // `aria-invalid` is invalid on role="button" — use a
                    // data-* hook so the existing red-border CSS still fires.
                    data-invalid={errors.availableMediums ? 'true' : 'false'}
                    data-testid="surveyform-languages-trigger"
                  >
                    <span>
                      {formData.availableMediums?.length
                        ? `${formData.availableMediums.length} selected`
                        : 'Select languages…'}
                    </span>
                    <Icon name="chevronDown" size={14} />
                  </button>
                  {showMediumDropdown && (
                    <div className="fmb-sf-multiselect-panel" role="listbox" aria-label="Languages">
                      {AVAILABLE_MEDIUMS.map(medium => {
                        const selected = formData.availableMediums.includes(medium);
                        return (
                          <div
                            key={medium}
                            role="option"
                            aria-selected={selected}
                            tabIndex={0}
                            className="fmb-sf-multiselect-option"
                            onClick={() => toggleMedium(medium)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMedium(medium); } }}
                          >
                            <span>{medium}</span>
                            {selected && <span className="check" aria-hidden="true">✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {errors.availableMediums && <div className="fmb-sf-field-error">{errors.availableMediums}</div>}
                {formData.availableMediums?.length > 0 && (
                  <div className="fmb-sf-tags" data-testid="surveyform-language-tags">
                    {formData.availableMediums.map(medium => (
                      <span key={medium} className="fmb-sf-tag">
                        {medium}
                        <button
                          type="button"
                          className="fmb-sf-tag-remove"
                          onClick={() => removeMedium(medium)}
                          aria-label={`Remove ${medium}`}
                        >×</button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="fmb-sf-field-help">Pick one or more. The first medium becomes the source language for translations.</p>
              </div>

              <div className="fmb-sf-field">
                <span className="fmb-sf-field-label">Hierarchical access level</span>
                <div className="fmb-sf-multiselect" ref={hierarchyDropdownRef}>
                  <button
                    type="button"
                    className="fmb-sf-multiselect-trigger"
                    onClick={() => setShowHierarchyDropdown(v => !v)}
                    aria-expanded={showHierarchyDropdown}
                    data-testid="surveyform-hierarchy-trigger"
                  >
                    <span>
                      {designations.length === 0
                        ? 'Loading levels…'
                        : selectedLevels.length === 0
                          ? 'Select hierarchy levels…'
                          : `${selectedLevels.length} selected`}
                    </span>
                    <Icon name="chevronDown" size={14} />
                  </button>
                  {showHierarchyDropdown && (
                    <div className="fmb-sf-multiselect-panel" role="listbox" aria-label="Hierarchy levels">
                      {designations.length === 0 && (
                        <div className="fmb-sf-multiselect-option fmb-sf-multiselect-option-empty">
                          No designations found. Add them in Designation Mapping.
                        </div>
                      )}
                      {designations.map(d => {
                        const lvlStr = String(d.hierarchy_level);
                        const selected = selectedLevels.includes(lvlStr);
                        const forced = lvlStr === '99';
                        return (
                          <div
                            key={`${d.state_code}-${d.designation_id || d.id || lvlStr}`}
                            role="option"
                            aria-selected={selected}
                            className="fmb-sf-multiselect-option"
                            style={forced ? { cursor: 'default', opacity: 0.7 } : undefined}
                            onClick={() => !forced && toggleHierarchyLevel(lvlStr)}
                          >
                            <span>
                              {d.hierarchy_level} — {d.designation_name}{' '}
                              <span style={{ color: 'var(--text-3, #6b6b73)' }}>({d.medium_in_english})</span>
                            </span>
                            {forced && <span className="check" aria-label="Always included">🔒</span>}
                            {selected && !forced && <span className="check" aria-hidden="true">✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {selectedLevels.length > 0 && (
                  <div className="fmb-sf-tags" data-testid="surveyform-hierarchy-tags">
                    {selectedLevels.map(lvl => {
                      const d = designations.find(x => String(x.hierarchy_level) === lvl);
                      const label = d ? `${lvl} — ${d.designation_name}` : `Level ${lvl}`;
                      const forced = lvl === '99';
                      return (
                        <span key={lvl} className={`fmb-sf-tag${forced ? ' locked' : ''}`}>
                          {label}
                          {forced
                            ? <span aria-label="Always included" title="Always included">🔒</span>
                            : (
                                <button
                                  type="button"
                                  className="fmb-sf-tag-remove"
                                  onClick={() => removeHierarchyLevel(lvl)}
                                  aria-label={`Remove level ${lvl}`}
                                >×</button>
                              )}
                        </span>
                      );
                    })}
                  </div>
                )}
                <p className="fmb-sf-field-help">Level 99 (Test) is always included automatically.</p>
              </div>
            </section>

            {/* Schedule */}
            <section className="fmb-sf-section" aria-labelledby="sf-schedule-h">
              <header className="fmb-sf-section-head">
                <h3 id="sf-schedule-h" className="fmb-sf-section-title">Schedule</h3>
                <p className="fmb-sf-section-sub">When the survey is live and how its data is treated.</p>
              </header>

              <div className="fmb-sf-grid cols-2">
                <div className="fmb-sf-field">
                  <label htmlFor="launchDate" className="fmb-sf-field-label">Launch date</label>
                  <div className={`fmb-sf-datepicker${errors.launchDate ? ' has-error' : ''}`}>
                    <DatePicker
                      id="launchDate"
                      selected={parseDateString(formData.launchDate)}
                      onChange={(date) => handleDateChange(date, 'launchDate')}
                      dateFormat="dd/MM/yyyy"
                      placeholderText="Select launch date"
                      isClearable
                    />
                  </div>
                  {errors.launchDate && <div className="fmb-sf-field-error">{errors.launchDate}</div>}
                  <p className="fmb-sf-field-help">Time auto-set to 00:00:00.</p>
                </div>
                <div className="fmb-sf-field">
                  <label htmlFor="closeDate" className="fmb-sf-field-label">Close date</label>
                  <div className={`fmb-sf-datepicker${errors.closeDate ? ' has-error' : ''}`}>
                    <DatePicker
                      id="closeDate"
                      selected={parseDateString(formData.closeDate)}
                      onChange={(date) => handleDateChange(date, 'closeDate')}
                      dateFormat="dd/MM/yyyy"
                      placeholderText="Select close date"
                      minDate={parseDateString(formData.launchDate)}
                      isClearable
                    />
                  </div>
                  {errors.closeDate && <div className="fmb-sf-field-error">{errors.closeDate}</div>}
                  <p className="fmb-sf-field-help">Time auto-set to 23:59:59. Must be on/after launch.</p>
                </div>
              </div>

              <div className="fmb-sf-field">
                <label htmlFor="mode" className="fmb-sf-field-label">Mode</label>
                <select
                  id="mode"
                  name="mode"
                  className="fmb-sf-field-select"
                  value={formData.mode}
                  onChange={handleChange}
                  data-testid="surveyform-mode"
                >
                  {MODE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <p className="fmb-sf-field-help">"New Data" is the default. "Correction" and "Delete Data" target existing rows.</p>
              </div>
            </section>

            {/* Behavior */}
            <section className="fmb-sf-section" aria-labelledby="sf-behavior-h">
              <header className="fmb-sf-section-head">
                <h3 id="sf-behavior-h" className="fmb-sf-section-title">Behavior</h3>
                <p className="fmb-sf-section-sub">Visibility, access, and submission rules.</p>
              </header>

              <div className="fmb-sf-grid cols-3">
                <YesNoField label="Public"                  name="public"                value={formData.public}                onChange={handleChange} />
                <YesNoField label="In school"               name="inSchool"              value={formData.inSchool}              onChange={handleChange} />
                <YesNoField label="Accept multiple entries" name="acceptMultipleEntries" value={formData.acceptMultipleEntries} onChange={handleChange} />
                <YesNoField label="Is active"               name="isActive"              value={formData.isActive}              onChange={handleChange} />
                <YesNoField label="Test survey"             name="testSurvey"            value={formData.testSurvey}            onChange={handleChange} />
              </div>
            </section>

            {/* Features */}
            <section className="fmb-sf-section" aria-labelledby="sf-features-h">
              <header className="fmb-sf-section-head">
                <h3 id="sf-features-h" className="fmb-sf-section-title">Features</h3>
                <p className="fmb-sf-section-sub">Optional integrations and field collection options.</p>
              </header>

              <div className="fmb-sf-grid cols-4">
                <YesNoField label="Visible on Report Bot" name="visibleOnReportBot" value={formData.visibleOnReportBot} onChange={handleChange} />
                <YesNoField label="Download response"     name="downloadResponse"   value={formData.downloadResponse}   onChange={handleChange} />
                <YesNoField label="Geo fencing"           name="geoFencing"         value={formData.geoFencing}         onChange={handleChange} />
                <YesNoField label="Geo tagging"           name="geoTagging"         value={formData.geoTagging}         onChange={handleChange} />
              </div>
            </section>

            {/* Submit */}
            <div className="fmb-sf-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/')}
                disabled={loading}
                data-testid="surveyform-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={submitDisabled}
                aria-busy={loading}
                data-testid="surveyform-submit"
              >
                {loading
                  ? (isEdit ? 'Saving…' : 'Creating…')
                  : (isEdit ? 'Save changes' : 'Create survey')}
              </button>
            </div>
          </div>

          {/* ── Right column: summary (sticky on desktop) ────── */}
          <aside className="fmb-sf-summary" aria-label="Survey summary">
            <div className="fmb-sf-summary-eyebrow">Preview</div>
            <div>
              <div className="fmb-sf-summary-title">{formData.surveyName || 'Untitled survey'}</div>
              <div className="fmb-sf-summary-id">{formData.surveyId || 'survey_id'}</div>
            </div>
            <p className="fmb-sf-summary-desc">
              {formData.surveyDescription || 'Add a description to help your team understand the purpose.'}
            </p>
            <hr className="fmb-sf-summary-divider" />
            <div className="fmb-sf-summary-kv">
              <span className="fmb-sf-summary-kv-label">Status</span>
              <span className="fmb-sf-summary-kv-value">
                <Badge status={formData.isActive === 'Yes' ? 'live' : 'locked'} dot={false}>
                  {formData.isActive === 'Yes' ? 'Active' : 'Inactive'}
                </Badge>
              </span>
            </div>
            <div className="fmb-sf-summary-kv">
              <span className="fmb-sf-summary-kv-label">Mode</span>
              <span className="fmb-sf-summary-kv-value">{formData.mode || '—'}</span>
            </div>
            <div className="fmb-sf-summary-kv">
              <span className="fmb-sf-summary-kv-label">Languages</span>
              <span className="fmb-sf-summary-tags">
                {formData.availableMediums?.length
                  ? formData.availableMediums.map(m => <Chip key={m}>{m}</Chip>)
                  : <span className="fmb-sf-summary-kv-value" style={{ color: 'var(--text-4, #9b9aa1)' }}>None</span>}
              </span>
            </div>
            <div className="fmb-sf-summary-kv">
              <span className="fmb-sf-summary-kv-label">Access levels</span>
              <span className="fmb-sf-summary-kv-value">
                {selectedLevels.length} selected
              </span>
            </div>
            <div className="fmb-sf-summary-kv">
              <span className="fmb-sf-summary-kv-label">Window</span>
              <span className="fmb-sf-summary-kv-value" style={{ fontSize: 11.5 }}>
                {(formData.launchDate || '—').split(' ')[0]} → {(formData.closeDate || '—').split(' ')[0]}
              </span>
            </div>
            <div className="fmb-sf-summary-kv">
              <span className="fmb-sf-summary-kv-label">Test survey</span>
              <span className="fmb-sf-summary-kv-value">{formData.testSurvey === 'Yes' ? 'Yes' : 'No'}</span>
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
};

/* ── Yes/No select field (preserves the Yes/No string contract) ── */
const YesNoField = ({ label, name, value, onChange }) => (
  <div className="fmb-sf-field">
    <label htmlFor={`sf-${name}`} className="fmb-sf-field-label">{label}</label>
    <select
      id={`sf-${name}`}
      name={name}
      className="fmb-sf-field-select"
      value={value}
      onChange={onChange}
      data-testid={`surveyform-${name}`}
    >
      {YES_NO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

export default SurveyForm;
