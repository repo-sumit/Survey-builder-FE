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
    setForm({ ...EMPTY_FORM,
      stateCode:         isAdmin ? (filterState || '') : (user?.stateCode || ''),
      medium_in_english: availableLangs.length === 1 ? availableLangs[0] : (filterMedium || ''),
      medium:            availableLangs.length === 1 ? availableLangs[0] : (filterMedium || '')
    });
    setEditingId(null); setEditingState(null); setFormError(null); setShowForm(true);
  };

  const openEdit = (row) => {
    setForm({ hierarchy_level: row.hierarchy_level, designation_name: row.designation_name,
      medium: row.medium, medium_in_english: row.medium_in_english, stateCode: row.state_code });
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
        const payload = { designation_name: form.designation_name.trim(), hierarchy_level: hl,
          medium: form.medium.trim(), medium_in_english: form.medium_in_english.trim() };
        if (isAdmin) payload.stateCode = editingState;
        await designationAPI.update(editingId, payload);
      } else {
        await designationAPI.create({ hierarchy_level: hl,
          designation_name: form.designation_name.trim(), medium: form.medium.trim(),
          medium_in_english: form.medium_in_english.trim(),
          stateCode: isAdmin ? form.stateCode.trim() : user?.stateCode });
      }
      setShowForm(false); load();
    } catch (err) { setFormError(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete "${row.designation_name}" (Level ${row.hierarchy_level})?`)) return;
    try { await designationAPI.delete(row.id, row.state_code); load(); }
    catch (err) { alert(err.response?.data?.error || 'Failed to delete'); }
  };

  const handleExport = async () => {
    try { setExporting(true); await designationAPI.exportXlsx(isAdmin ? filterState || undefined : user?.stateCode); }
    catch { alert('Failed to export'); }
    finally { setExporting(false); }
  };

  const handleMediumEnChange = (val) =>
    setForm(p => ({ ...p, medium_in_english: val, medium: val }));

  const stateCodes    = stateConfigs.map(s => ({ code: s.state_code, name: s.state_name }));
  const formStateCode = editingId ? editingState : (isAdmin ? form.stateCode : user?.stateCode);
  const formSC        = stateConfigs.find(s => s.state_code === formStateCode);
  const formLangs     = formSC
    ? (formSC.available_languages || '').split(',').map(l => l.trim()).filter(Boolean)
    : [];

  return (
    <div className="admin-panel">
      <div className="list-header">
        <h2 className="fw-bold" style={{ letterSpacing: '-0.02em' }}>Designation Mapping</h2>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : '↓ Export'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Designation</button>
        </div>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {/* Filters */}
      <div className="desig-filters">
        {isAdmin && (
          <div style={{ minWidth: 200 }}>
            <label className="form-label fw-semibold mb-1" style={{ fontSize: '0.8rem' }}>Filter by State</label>
            <select className="form-select form-select-sm" value={filterState}
              onChange={e => { setFilterState(e.target.value); setFilterMedium(''); }}>
              <option value="">All States</option>
              {stateCodes.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
            </select>
          </div>
        )}
        {availableLangs.length > 1 && (
          <div style={{ minWidth: 170 }}>
            <label className="form-label fw-semibold mb-1" style={{ fontSize: '0.8rem' }}>Filter by Language</label>
            <select className="form-select form-select-sm" value={filterMedium}
              onChange={e => setFilterMedium(e.target.value)}>
              <option value="">All Languages</option>
              {availableLangs.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}
        {!isAdmin && currentSC && (
          <div className="align-self-end pb-1">
            <span className="badge bg-secondary-subtle text-secondary">{currentSC.state_name}</span>
          </div>
        )}
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="card mb-4 border-0 shadow-sm">
          <div className="card-header bg-transparent fw-semibold">
            {editingId !== null ? 'Edit Designation' : 'Add New Designation'}
          </div>
          <div className="card-body">
            {formError && <div className="alert alert-danger py-2 mb-3">{formError}</div>}
            <form onSubmit={handleSave}>
              <div className="row g-3 mb-3">
                {isAdmin && !editingId && (
                  <div className="col-md-3">
                    <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>
                      State <span className="required">*</span>
                    </label>
                    <select className="form-select form-select-sm" value={form.stateCode}
                      onChange={e => setForm(p => ({ ...p, stateCode: e.target.value, medium: '', medium_in_english: '' }))}>
                      <option value="">Select State…</option>
                      {stateCodes.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                    </select>
                  </div>
                )}
                <div className="col-md-3">
                  <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>
                    Language / Medium <span className="required">*</span>
                  </label>
                  {formLangs.length > 0 ? (
                    <select className="form-select form-select-sm" value={form.medium_in_english}
                      onChange={e => handleMediumEnChange(e.target.value)} disabled={!!editingId}>
                      <option value="">Select language…</option>
                      {formLangs.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  ) : (
                    <input type="text" className="form-control form-control-sm"
                      value={form.medium_in_english}
                      onChange={e => handleMediumEnChange(e.target.value)}
                      placeholder="e.g., English, Hindi" disabled={!!editingId} />
                  )}
                </div>
                <div className="col-md-2">
                  <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>
                    Hierarchy Level <span className="required">*</span>
                  </label>
                  <input type="number" className="form-control form-control-sm" min="1" max="100"
                    value={form.hierarchy_level}
                    onChange={e => setForm(p => ({ ...p, hierarchy_level: e.target.value }))}
                    placeholder="1" />
                </div>
              </div>

              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>
                    List of Designations <span className="required">*</span>
                  </label>
                  <input type="text" className="form-control form-control-sm"
                    value={form.designation_name}
                    onChange={e => setForm(p => ({ ...p, designation_name: e.target.value }))}
                    placeholder="e.g., District Education Officer" />
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>
                    Medium (Local Script) <span className="required">*</span>
                  </label>
                  <input type="text" className="form-control form-control-sm"
                    value={form.medium}
                    onChange={e => setForm(p => ({ ...p, medium: e.target.value }))}
                    placeholder="e.g., हिंदी" />
                  <div className="form-text" style={{ fontSize: '0.72rem' }}>
                    Same as Language for English; local script for others.
                  </div>
                </div>
              </div>

              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving ? 'Saving…' : (editingId !== null ? 'Update' : 'Create')}
                </button>
                <button type="button" className="btn btn-outline-secondary btn-sm"
                  onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center text-muted py-5">Loading designations…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted py-5">
          <p>No designations found.{!isAdmin && <> Click <strong>+ Add Designation</strong> to create the first one.</>}</p>
        </div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  {isAdmin && <th style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>State</th>}
                  <th style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Level</th>
                  <th style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Designation</th>
                  <th style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Medium</th>
                  <th style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Medium (EN)</th>
                  <th style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    {isAdmin && <td><span className="badge bg-secondary-subtle text-secondary">{row.state_code}</span></td>}
                    <td><span className="badge bg-primary-subtle text-primary fw-bold">{row.hierarchy_level}</span></td>
                    <td className="fw-medium">{row.designation_name}</td>
                    <td>{row.medium}</td>
                    <td className="text-muted">{row.medium_in_english}</td>
                    <td>
                      <div className="d-flex gap-2">
                        <button className="btn btn-outline-secondary btn-sm" onClick={() => openEdit(row)}>Edit</button>
                        <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(row)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DesignationMapping;
