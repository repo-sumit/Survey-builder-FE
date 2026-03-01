import React, { useState, useEffect, useCallback } from 'react';
import { designationAPI, stateConfigAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const EMPTY_FORM = {
  hierarchy_level:   '',
  designation_name:  '',
  medium:            '',
  medium_in_english: '',
  stateCode:         ''
};

const DesignationMapping = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  /* ── State ──────────────────────────────────────────────────────────────── */
  const [rows, setRows]                   = useState([]);
  const [stateConfigs, setStateConfigs]   = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [showForm, setShowForm]           = useState(false);
  const [editingId, setEditingId]         = useState(null); // serial PK being edited
  const [editingState, setEditingState]   = useState(null);
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [formError, setFormError]         = useState(null);
  const [saving, setSaving]               = useState(false);
  const [exporting, setExporting]         = useState(false);

  // Filters
  const [filterState, setFilterState]   = useState('');
  const [filterMedium, setFilterMedium] = useState('');

  /* ── Derived: which state to use for current user ───────────────────────── */
  const userStateCode = isAdmin ? filterState : (user?.stateCode || '');

  /* ── Available languages for the currently selected/user state ──────────── */
  const currentStateConfig = stateConfigs.find(s => s.state_code === userStateCode);
  const availableLangs = currentStateConfig
    ? (currentStateConfig.available_languages || '').split(',').map(l => l.trim()).filter(Boolean)
    : [];

  /* ── Load state configs once ────────────────────────────────────────────── */
  useEffect(() => {
    stateConfigAPI.getAll()
      .then(setStateConfigs)
      .catch(() => {}); // non-critical
  }, []);

  /* ── Load designations ──────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (isAdmin && filterState) params.stateCode = filterState;
      else if (!isAdmin)          params.stateCode = user?.stateCode;
      if (filterMedium)           params.medium    = filterMedium;
      const data = await designationAPI.getAll(params);
      setRows(data);
    } catch {
      setError('Failed to load designations');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, filterState, filterMedium, user?.stateCode]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  /* ── Open Add form ────────────────────────────────────────────────────── */
  const openAdd = () => {
    setForm({
      ...EMPTY_FORM,
      stateCode:         isAdmin ? (filterState || '') : (user?.stateCode || ''),
      medium_in_english: availableLangs.length === 1 ? availableLangs[0] : (filterMedium || ''),
      medium:            availableLangs.length === 1 ? availableLangs[0] : (filterMedium || '')
    });
    setEditingId(null);
    setEditingState(null);
    setFormError(null);
    setShowForm(true);
  };

  /* ── Open Edit form ──────────────────────────────────────────────────── */
  const openEdit = (row) => {
    setForm({
      hierarchy_level:   row.hierarchy_level,
      designation_name:  row.designation_name,
      medium:            row.medium,
      medium_in_english: row.medium_in_english,
      stateCode:         row.state_code
    });
    setEditingId(row.id);
    setEditingState(row.state_code);
    setFormError(null);
    setShowForm(true);
  };

  /* ── Save ────────────────────────────────────────────────────────────── */
  const handleSave = async (e) => {
    e.preventDefault();
    setFormError(null);

    const hl = parseInt(form.hierarchy_level, 10);
    if (!hl || hl < 1) {
      setFormError('Hierarchy Level must be a positive number');
      return;
    }
    if (!form.designation_name.trim() || !form.medium.trim() || !form.medium_in_english.trim()) {
      setFormError('Designation Name, Medium, and Medium (English) are all required');
      return;
    }
    if (isAdmin && !editingId && !form.stateCode.trim()) {
      setFormError('State Code is required');
      return;
    }

    try {
      setSaving(true);
      if (editingId !== null) {
        const payload = {
          designation_name:  form.designation_name.trim(),
          hierarchy_level:   hl,
          medium:            form.medium.trim(),
          medium_in_english: form.medium_in_english.trim()
        };
        if (isAdmin) payload.stateCode = editingState;
        await designationAPI.update(editingId, payload);
      } else {
        await designationAPI.create({
          hierarchy_level:   hl,
          designation_name:  form.designation_name.trim(),
          medium:            form.medium.trim(),
          medium_in_english: form.medium_in_english.trim(),
          stateCode:         isAdmin ? form.stateCode.trim() : user?.stateCode
        });
      }
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save designation');
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete ──────────────────────────────────────────────────────────── */
  const handleDelete = async (row) => {
    if (!window.confirm(`Delete "${row.designation_name}" (Level ${row.hierarchy_level})?`)) return;
    try {
      await designationAPI.delete(row.id, row.state_code);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete designation');
    }
  };

  /* ── Export ──────────────────────────────────────────────────────────── */
  const handleExport = async () => {
    try {
      setExporting(true);
      const sc = isAdmin ? filterState || undefined : user?.stateCode;
      await designationAPI.exportXlsx(sc);
    } catch {
      alert('Failed to export');
    } finally {
      setExporting(false);
    }
  };

  /* ── Unique state codes (for admin state filter) ─────────────────────── */
  const stateCodes = stateConfigs.map(s => ({ code: s.state_code, name: s.state_name }));

  /* ── Available mediums for form language dropdown ────────────────────── */
  const formStateCode = editingId ? editingState : (isAdmin ? form.stateCode : user?.stateCode);
  const formStateConfig = stateConfigs.find(s => s.state_code === formStateCode);
  const formLangs = formStateConfig
    ? (formStateConfig.available_languages || '').split(',').map(l => l.trim()).filter(Boolean)
    : [];

  /* When medium_in_english changes, also update medium (local script) */
  const handleMediumEnChange = (val) => {
    setForm(p => ({ ...p, medium_in_english: val, medium: val }));
  };

  return (
    <div className="admin-panel">
      {/* Header */}
      <div className="list-header">
        <h2>Designation Mapping</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : '↓ Export'}
          </button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Designation</button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Filters */}
      <div className="desig-filters">
        {isAdmin && (
          <div className="form-group" style={{ minWidth: '200px' }}>
            <label>Filter by State</label>
            <select value={filterState} onChange={e => { setFilterState(e.target.value); setFilterMedium(''); }}>
              <option value="">All States</option>
              {stateCodes.map(s => (
                <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>
        )}

        {/* Show language filter when state has multiple languages */}
        {(isAdmin ? filterState : true) && availableLangs.length > 1 && (
          <div className="form-group" style={{ minWidth: '180px' }}>
            <label>Filter by Language</label>
            <select value={filterMedium} onChange={e => setFilterMedium(e.target.value)}>
              <option value="">All Languages</option>
              {availableLangs.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        )}

        {!isAdmin && userStateCode && (
          <div style={{ alignSelf: 'flex-end', paddingBottom: '0.25rem' }}>
            <span className="badge badge-state">{currentStateConfig?.state_name || userStateCode}</span>
          </div>
        )}
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="admin-form-card">
          <h3>{editingId !== null ? 'Edit Designation' : 'Add New Designation'}</h3>
          {formError && <div className="error-message" style={{ marginBottom: '1rem' }}>{formError}</div>}
          <form onSubmit={handleSave}>
            <div className="form-row">
              {isAdmin && !editingId && (
                <div className="form-group">
                  <label>State Code <span className="required">*</span></label>
                  <select
                    value={form.stateCode}
                    onChange={e => setForm(p => ({ ...p, stateCode: e.target.value, medium: '', medium_in_english: '' }))}
                  >
                    <option value="">Select State…</option>
                    {stateCodes.map(s => (
                      <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Language dropdown: from state config if available, else free text */}
              <div className="form-group">
                <label>Medium (Language) <span className="required">*</span></label>
                {formLangs.length > 0 ? (
                  <select
                    value={form.medium_in_english}
                    onChange={e => handleMediumEnChange(e.target.value)}
                    disabled={!!editingId}
                  >
                    <option value="">Select language…</option>
                    {formLangs.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.medium_in_english}
                    onChange={e => handleMediumEnChange(e.target.value)}
                    placeholder="e.g., English, Hindi"
                    disabled={!!editingId}
                  />
                )}
              </div>

              <div className="form-group">
                <label>Hierarchy Level <span className="required">*</span></label>
                <input
                  type="number" min="1" max="100"
                  value={form.hierarchy_level}
                  onChange={e => setForm(p => ({ ...p, hierarchy_level: e.target.value }))}
                  placeholder="e.g., 1"
                />
              </div>
            </div>

            <div className="form-group">
              <label>List of Designations (Name) <span className="required">*</span></label>
              <input
                type="text"
                value={form.designation_name}
                onChange={e => setForm(p => ({ ...p, designation_name: e.target.value }))}
                placeholder="e.g., District Education Officer"
              />
            </div>

            {/* Medium (local script) — shown only when different from medium_in_english */}
            <div className="form-group">
              <label>Medium (Local Script) <span className="required">*</span></label>
              <input
                type="text"
                value={form.medium}
                onChange={e => setForm(p => ({ ...p, medium: e.target.value }))}
                placeholder="e.g., हिंदी (if different from English name)"
              />
              <small style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                For English medium, this is the same as Medium (Language). For Hindi it would be "हिंदी".
              </small>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : (editingId !== null ? 'Update' : 'Create')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="loading">Loading designations…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <p>No designations found.
            {!isAdmin && ' Click '}
            {!isAdmin && <strong>+ Add Designation</strong>}
            {!isAdmin && ' to create the first one.'}
          </p>
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                {isAdmin && <th>State</th>}
                <th>Hierarchy Level</th>
                <th>List of Designations</th>
                <th>Medium</th>
                <th>Medium (EN)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  {isAdmin && <td>{row.state_code}</td>}
                  <td><strong>{row.hierarchy_level}</strong></td>
                  <td>{row.designation_name}</td>
                  <td>{row.medium}</td>
                  <td>{row.medium_in_english}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DesignationMapping;
