import React, { useState, useEffect } from 'react';
import { designationAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const EMPTY_FORM = {
  designation_id: '',
  hierarchy_level: '',
  designation_name: '',
  medium: '',
  medium_in_english: '',
  is_active: true,
  stateCode: ''
};

const DesignationMapping = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState(null); // designation_id being edited
  const [editingState, setEditingState] = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formError, setFormError]   = useState(null);
  const [saving, setSaving]         = useState(false);
  const [filterState, setFilterState] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  useEffect(() => { load(); }, [filterState, activeOnly]); // eslint-disable-line

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { activeOnly };
      if (isAdmin && filterState) params.stateCode = filterState;
      const data = await designationAPI.getAll(params);
      setRows(data);
    } catch (err) {
      setError('Failed to load designations');
    } finally {
      setLoading(false);
    }
  };

  // ── Open Add form ────────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...EMPTY_FORM, stateCode: isAdmin ? '' : (user?.stateCode || '') });
    setEditingId(null);
    setEditingState(null);
    setFormError(null);
    setShowForm(true);
  };

  // ── Open Edit form ───────────────────────────────────────────────────────────
  const openEdit = (row) => {
    setForm({
      designation_id:    row.designation_id,
      hierarchy_level:   row.hierarchy_level,
      designation_name:  row.designation_name,
      medium:            row.medium,
      medium_in_english: row.medium_in_english,
      is_active:         row.is_active,
      stateCode:         row.state_code
    });
    setEditingId(row.designation_id);
    setEditingState(row.state_code);
    setFormError(null);
    setShowForm(true);
  };

  // ── Save (create or update) ──────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setFormError(null);

    const did = parseInt(form.designation_id, 10);
    if (!did || did < 1 || did > 100) {
      setFormError('Designation ID must be a number between 1 and 100');
      return;
    }
    if (!form.hierarchy_level || isNaN(parseInt(form.hierarchy_level, 10))) {
      setFormError('Hierarchy Level must be a number');
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
        // PATCH
        const payload = {
          designation_name:  form.designation_name.trim(),
          hierarchy_level:   parseInt(form.hierarchy_level, 10),
          medium:            form.medium.trim(),
          medium_in_english: form.medium_in_english.trim(),
          is_active:         form.is_active
        };
        if (isAdmin) payload.stateCode = editingState;
        await designationAPI.update(editingId, payload);
      } else {
        // POST
        await designationAPI.create({
          designation_id:    did,
          hierarchy_level:   parseInt(form.hierarchy_level, 10),
          designation_name:  form.designation_name.trim(),
          medium:            form.medium.trim(),
          medium_in_english: form.medium_in_english.trim(),
          is_active:         form.is_active,
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

  // ── Toggle active / inactive inline ─────────────────────────────────────────
  const toggleActive = async (row) => {
    try {
      const payload = { is_active: !row.is_active };
      if (isAdmin) payload.stateCode = row.state_code;
      await designationAPI.update(row.designation_id, payload);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
    }
  };

  // ── Unique state codes from rows (for admin filter) ──────────────────────────
  const stateCodes = [...new Set(rows.map(r => r.state_code))].sort();

  return (
    <div className="admin-panel">
      {/* Header */}
      <div className="list-header">
        <h2>Designation Mapping</h2>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Designation</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Filters */}
      <div className="desig-filters">
        {isAdmin && (
          <div className="form-group" style={{ minWidth: '180px' }}>
            <label>Filter by State</label>
            <select value={filterState} onChange={e => setFilterState(e.target.value)}>
              <option value="">All States</option>
              {stateCodes.map(sc => <option key={sc} value={sc}>{sc}</option>)}
            </select>
          </div>
        )}
        <label className="desig-checkbox-label">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={e => setActiveOnly(e.target.checked)}
          />
          Active only
        </label>
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
                  <input
                    type="text"
                    value={form.stateCode}
                    onChange={e => setForm(p => ({ ...p, stateCode: e.target.value }))}
                    placeholder="e.g., MH"
                    maxLength={10}
                  />
                </div>
              )}
              <div className="form-group">
                <label>Designation ID (1-100) <span className="required">*</span></label>
                <input
                  type="number" min="1" max="100"
                  value={form.designation_id}
                  onChange={e => setForm(p => ({ ...p, designation_id: e.target.value }))}
                  disabled={editingId !== null}
                  placeholder="e.g., 1"
                />
              </div>
              <div className="form-group">
                <label>Hierarchy Level <span className="required">*</span></label>
                <input
                  type="number"
                  value={form.hierarchy_level}
                  onChange={e => setForm(p => ({ ...p, hierarchy_level: e.target.value }))}
                  placeholder="e.g., 5"
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

            <div className="form-row">
              <div className="form-group">
                <label>Medium <span className="required">*</span></label>
                <input
                  type="text"
                  value={form.medium}
                  onChange={e => setForm(p => ({ ...p, medium: e.target.value }))}
                  placeholder="e.g., Hindi"
                />
              </div>
              <div className="form-group">
                <label>Medium (English) <span className="required">*</span></label>
                <input
                  type="text"
                  value={form.medium_in_english}
                  onChange={e => setForm(p => ({ ...p, medium_in_english: e.target.value }))}
                  placeholder="e.g., Hindi / English"
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select
                  value={form.is_active ? 'active' : 'inactive'}
                  onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'active' }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : (editingId !== null ? 'Update' : 'Create')}
              </button>
              <button
                type="button" className="btn btn-secondary"
                onClick={() => setShowForm(false)}
              >
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
          <p>No designations found. Click <strong>+ Add Designation</strong> to create the first one.</p>
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                {isAdmin && <th>State</th>}
                <th>ID</th>
                <th>Hierarchy Level</th>
                <th>Designation Name</th>
                <th>Medium</th>
                <th>Medium (EN)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={`${row.state_code}-${row.designation_id}`}>
                  {isAdmin && <td>{row.state_code}</td>}
                  <td>{row.designation_id}</td>
                  <td><strong>{row.hierarchy_level}</strong></td>
                  <td>{row.designation_name}</td>
                  <td>{row.medium}</td>
                  <td>{row.medium_in_english}</td>
                  <td>
                    <span className={`badge ${row.is_active ? 'badge-active' : 'badge-inactive'}`}>
                      {row.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        className={`btn btn-sm ${row.is_active ? 'btn-warning' : 'btn-secondary'}`}
                        onClick={() => toggleActive(row)}
                      >
                        {row.is_active ? 'Deactivate' : 'Activate'}
                      </button>
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
