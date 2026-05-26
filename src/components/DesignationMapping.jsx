import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { designationAPI, stateConfigAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import PageHeader from './ui/PageHeader';
import Icon from './ui/Icon';

const EMPTY_FORM = {
  hierarchy_level:   '',
  designation_name:  '',
  medium:            '',
  medium_in_english: '',
  stateCode:         ''
};

const DesignationMapping = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin  = user?.role === 'admin';

  const [rows, setRows]                 = useState([]);
  const [stateConfigs, setStateConfigs] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [showForm, setShowForm]         = useState(false);
  const [editingId, setEditingId]       = useState(null);
  const [editingState, setEditingState] = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [formError, setFormError]       = useState(null);
  const [saving, setSaving]             = useState(false);
  const [exporting, setExporting]       = useState(false);
  const [seeding, setSeeding]           = useState(false);
  const [filterState, setFilterState]   = useState('');
  const [filterMedium, setFilterMedium] = useState('');

  const userStateCode  = isAdmin ? filterState : (user?.stateCode || '');
  const currentSC      = stateConfigs.find(s => s.state_code === userStateCode);
  const availableLangs = currentSC
    ? (currentSC.available_languages || '').split(',').map(l => l.trim()).filter(Boolean)
    : [];

  useEffect(() => { stateConfigAPI.getAll().then(setStateConfigs).catch(() => {}); }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const params = {};
      if (isAdmin && filterState) params.stateCode = filterState;
      else if (!isAdmin) params.stateCode = user?.stateCode;
      if (filterMedium) params.medium = filterMedium;
      setRows(await designationAPI.getAll(params));
    } catch { setError('Failed to load designations'); }
    finally { setLoading(false); }
  }, [isAdmin, filterState, filterMedium, user?.stateCode]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({
      ...EMPTY_FORM,
      stateCode:         isAdmin ? (filterState || '') : (user?.stateCode || ''),
      medium_in_english: availableLangs.length === 1 ? availableLangs[0] : (filterMedium || ''),
      medium:            availableLangs.length === 1 ? availableLangs[0] : (filterMedium || '')
    });
    setEditingId(null); setEditingState(null); setFormError(null); setShowForm(true);
  };

  const openEdit = (row) => {
    setForm({
      hierarchy_level: row.hierarchy_level, designation_name: row.designation_name,
      medium: row.medium, medium_in_english: row.medium_in_english, stateCode: row.state_code
    });
    setEditingId(row.id); setEditingState(row.state_code); setFormError(null); setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault(); setFormError(null);
    const hl = parseInt(form.hierarchy_level, 10);
    if (!hl || hl < 1) return setFormError('Hierarchy Level must be a positive number');
    if (!form.designation_name.trim() || !form.medium.trim() || !form.medium_in_english.trim())
      return setFormError('Designation Name, Medium, and Medium (English) are all required');
    if (isAdmin && !editingId && !form.stateCode.trim()) return setFormError('State Code is required');
    try {
      setSaving(true);
      if (editingId !== null) {
        const payload = {
          designation_name: form.designation_name.trim(), hierarchy_level: hl,
          medium: form.medium.trim(), medium_in_english: form.medium_in_english.trim()
        };
        if (isAdmin) payload.stateCode = editingState;
        await designationAPI.update(editingId, payload);
      } else {
        await designationAPI.create({
          hierarchy_level: hl,
          designation_name: form.designation_name.trim(), medium: form.medium.trim(),
          medium_in_english: form.medium_in_english.trim(),
          stateCode: isAdmin ? form.stateCode.trim() : user?.stateCode
        });
      }
      setShowForm(false); load();
    } catch (err) { setFormError(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete "${row.designation_name}" (Level ${row.hierarchy_level})?`)) return;
    try { await designationAPI.delete(row.id, row.state_code); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      await designationAPI.exportXlsx(isAdmin ? filterState || undefined : user?.stateCode);
    } catch { toast.error('Failed to export'); }
    finally { setExporting(false); }
  };

  const handleSeedDefaults = async () => {
    const targetState = isAdmin ? (filterState || '') : (user?.stateCode || '');
    if (!targetState) {
      toast.error('Pick a state filter first to seed defaults.');
      return;
    }
    if (!window.confirm(`Seed the default designation hierarchy for ${targetState}? Existing designations will not be overwritten.`)) return;
    try {
      setSeeding(true);
      await designationAPI.seedDefaults(targetState);
      toast.success(`Defaults seeded for ${targetState}.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to seed defaults');
    } finally {
      setSeeding(false);
    }
  };

  const handleMediumEnChange = (val) =>
    setForm(p => ({ ...p, medium_in_english: val, medium: val }));

  const stateCodes    = stateConfigs.map(s => ({ code: s.state_code, name: s.state_name }));
  const formStateCode = editingId ? editingState : (isAdmin ? form.stateCode : user?.stateCode);
  const formSC        = stateConfigs.find(s => s.state_code === formStateCode);
  const formLangs     = formSC
    ? (formSC.available_languages || '').split(',').map(l => l.trim()).filter(Boolean)
    : [];

  /* ── Derived summary metrics ─────────────────────────────── */
  const levelCount = useMemo(() => {
    const set = new Set();
    rows.forEach(r => set.add(Number(r.hierarchy_level)));
    return set.size;
  }, [rows]);

  const stateCount = useMemo(() => {
    const set = new Set();
    rows.forEach(r => set.add(r.state_code));
    return set.size;
  }, [rows]);

  const seedAvailable = isAdmin ? !!filterState : !!user?.stateCode;

  return (
    <div className="fmb-dm-page" data-testid="dm-page">
      <PageHeader
        eyebrow="CONFIG"
        title="Designation mapping"
        sub="Define the hierarchy of designations per state. Each row is a single role × level × language combination."
        actions={
          <div className="fmb-dm-toolbar">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleSeedDefaults}
              disabled={seeding || !seedAvailable}
              title={seedAvailable
                ? 'Seed the default hierarchy for the current state'
                : 'Pick a state filter first'}
              data-testid="dm-seed"
            >
              {seeding ? 'Seeding…' : 'Seed defaults'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExport}
              disabled={exporting}
              data-testid="dm-export"
            >
              {exporting ? 'Exporting…' : 'Export XLSX'}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={openAdd}
              data-testid="dm-add"
            >
              <Icon name="plus" size={14} /> Add designation
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/')}
              data-testid="dm-back"
            >
              <Icon name="chevronLeft" /> Back
            </button>
          </div>
        }
      />

      {error && (
        <div className="fmb-dm-error-banner" role="alert" data-testid="dm-error">{error}</div>
      )}

      {/* Filters */}
      <section className="fmb-dm-section" aria-labelledby="dm-filters-h" data-testid="dm-filters">
        <header className="fmb-dm-section-head">
          <h3 id="dm-filters-h" className="fmb-dm-section-title">Filters</h3>
          <p className="fmb-dm-section-sub">
            {isAdmin
              ? 'Admins can scope to one state at a time. Without a filter, all states are returned.'
              : `Scoped to your state: ${user?.stateCode || '—'}.`}
          </p>
        </header>
        <div className="fmb-dm-filters">
          {isAdmin && (
            <div className="fmb-dm-field">
              <label htmlFor="dm-filter-state" className="fmb-dm-field-label">State</label>
              <select
                id="dm-filter-state"
                value={filterState}
                onChange={e => { setFilterState(e.target.value); setFilterMedium(''); }}
                className="fmb-dm-field-select"
                data-testid="dm-filter-state"
              >
                <option value="">All states</option>
                {stateCodes.map(s => (
                  <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
          )}
          {availableLangs.length > 1 && (
            <div className="fmb-dm-field">
              <label htmlFor="dm-filter-medium" className="fmb-dm-field-label">Language</label>
              <select
                id="dm-filter-medium"
                value={filterMedium}
                onChange={e => setFilterMedium(e.target.value)}
                className="fmb-dm-field-select"
                data-testid="dm-filter-medium"
              >
                <option value="">All languages</option>
                {availableLangs.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          {!isAdmin && currentSC && (
            <div className="fmb-dm-field">
              <span className="fmb-dm-field-label">Current state</span>
              <span className="fmb-dm-chip accent" data-testid="dm-current-state">
                {currentSC.state_name} · {currentSC.state_code}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Summary metrics */}
      {rows.length > 0 && (
        <section className="fmb-dm-section" aria-labelledby="dm-summary-h" data-testid="dm-summary">
          <header className="fmb-dm-section-head">
            <h3 id="dm-summary-h" className="fmb-dm-section-title">Summary</h3>
            <p className="fmb-dm-section-sub">Derived from the currently filtered rows.</p>
          </header>
          <div className="fmb-dm-metrics">
            <div className="fmb-dm-metric">
              <span className="fmb-dm-metric-label">Designations</span>
              <span className="fmb-dm-metric-value" data-testid="dm-metric-count">{rows.length}</span>
            </div>
            <div className="fmb-dm-metric">
              <span className="fmb-dm-metric-label">Levels</span>
              <span className="fmb-dm-metric-value">{levelCount}</span>
            </div>
            {isAdmin && (
              <div className="fmb-dm-metric">
                <span className="fmb-dm-metric-label">States</span>
                <span className="fmb-dm-metric-value">{stateCount}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <section className="fmb-dm-section" aria-labelledby="dm-form-h" data-testid="dm-form">
          <header className="fmb-dm-section-head">
            <h3 id="dm-form-h" className="fmb-dm-section-title">
              {editingId !== null ? 'Edit designation' : 'Add new designation'}
            </h3>
            <p className="fmb-dm-section-sub">
              All fields are required. State and language can't change after creation.
            </p>
          </header>
          {formError && (
            <div className="fmb-dm-field-error" role="alert" data-testid="dm-form-error">{formError}</div>
          )}
          <form onSubmit={handleSave} noValidate>
            <div className="fmb-dm-form-grid">
              {isAdmin && !editingId && (
                <div className="fmb-dm-field">
                  <label htmlFor="dm-form-state" className="fmb-dm-field-label">
                    State <span className="fmb-dm-required">*</span>
                  </label>
                  <select
                    id="dm-form-state"
                    value={form.stateCode}
                    onChange={e => setForm(p => ({ ...p, stateCode: e.target.value, medium: '', medium_in_english: '' }))}
                    className="fmb-dm-field-select"
                  >
                    <option value="">Select state…</option>
                    {stateCodes.map(s => (
                      <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="fmb-dm-field">
                <label htmlFor="dm-form-lang" className="fmb-dm-field-label">
                  Language / Medium <span className="fmb-dm-required">*</span>
                </label>
                {formLangs.length > 0 ? (
                  <select
                    id="dm-form-lang"
                    value={form.medium_in_english}
                    onChange={e => handleMediumEnChange(e.target.value)}
                    disabled={!!editingId}
                    className="fmb-dm-field-select"
                  >
                    <option value="">Select language…</option>
                    {formLangs.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                ) : (
                  <input
                    id="dm-form-lang"
                    type="text"
                    value={form.medium_in_english}
                    onChange={e => handleMediumEnChange(e.target.value)}
                    placeholder="e.g., English, Hindi"
                    disabled={!!editingId}
                    className="fmb-dm-field-input"
                  />
                )}
              </div>
              <div className="fmb-dm-field">
                <label htmlFor="dm-form-level" className="fmb-dm-field-label">
                  Hierarchy level <span className="fmb-dm-required">*</span>
                </label>
                <input
                  id="dm-form-level"
                  type="number"
                  min="1"
                  max="100"
                  value={form.hierarchy_level}
                  onChange={e => setForm(p => ({ ...p, hierarchy_level: e.target.value }))}
                  placeholder="1"
                  className="fmb-dm-field-input"
                />
              </div>
            </div>

            <div className="fmb-dm-form-grid" style={{ marginTop: 'var(--s-3)' }}>
              <div className="fmb-dm-field">
                <label htmlFor="dm-form-name" className="fmb-dm-field-label">
                  Designation <span className="fmb-dm-required">*</span>
                </label>
                <input
                  id="dm-form-name"
                  type="text"
                  value={form.designation_name}
                  onChange={e => setForm(p => ({ ...p, designation_name: e.target.value }))}
                  placeholder="e.g., District Education Officer"
                  className="fmb-dm-field-input"
                />
              </div>
              <div className="fmb-dm-field">
                <label htmlFor="dm-form-medium" className="fmb-dm-field-label">
                  Medium (local script) <span className="fmb-dm-required">*</span>
                </label>
                <input
                  id="dm-form-medium"
                  type="text"
                  value={form.medium}
                  onChange={e => setForm(p => ({ ...p, medium: e.target.value }))}
                  placeholder="e.g., हिंदी"
                  className="fmb-dm-field-input"
                />
                <p className="fmb-dm-field-help">Same as Language for English; local script for others.</p>
              </div>
            </div>

            <div className="fmb-dm-form-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowForm(false)}
                disabled={saving}
                data-testid="dm-form-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={saving}
                aria-busy={saving}
                data-testid="dm-form-save"
              >
                {saving ? 'Saving…' : (editingId !== null ? 'Update' : 'Create')}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Table / list */}
      {loading ? (
        <div data-testid="dm-loading" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="fmb-dm-skel" style={{ height: 48 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="fmb-dm-empty" data-testid="dm-empty">
          <div className="fmb-dm-empty-title">No designations found</div>
          <p>
            {seedAvailable
              ? <>Click <strong>Seed defaults</strong> to populate the default hierarchy, or <strong>Add designation</strong> to create one manually.</>
              : <>Click <strong>Add designation</strong> to create the first one.</>}
          </p>
        </div>
      ) : (
        <section className="fmb-dm-section" aria-labelledby="dm-list-h" data-testid="dm-list">
          <header className="fmb-dm-section-head">
            <h3 id="dm-list-h" className="fmb-dm-section-title">Designations</h3>
            <p className="fmb-dm-section-sub">{rows.length} row(s).</p>
          </header>
          <div className="fmb-dm-table-wrap">
            <table className="fmb-dm-table" data-testid="dm-table">
              <thead>
                <tr>
                  {isAdmin && <th scope="col">State</th>}
                  <th scope="col">Level</th>
                  <th scope="col">Designation</th>
                  <th scope="col">Medium</th>
                  <th scope="col">Medium (EN)</th>
                  <th scope="col" style={{ width: 1, whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} data-testid="dm-row" data-row-id={row.id}>
                    {isAdmin && (
                      <td><span className="fmb-dm-chip">{row.state_code}</span></td>
                    )}
                    <td><span className="fmb-dm-level">{row.hierarchy_level}</span></td>
                    <td style={{ fontWeight: 500 }}>{row.designation_name}</td>
                    <td>{row.medium}</td>
                    <td style={{ color: 'var(--text-3, #6b6b73)' }}>{row.medium_in_english}</td>
                    <td>
                      <div className="fmb-dm-row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEdit(row)}
                          data-testid="dm-row-edit"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(row)}
                          data-testid="dm-row-delete"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default DesignationMapping;
