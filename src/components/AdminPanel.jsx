import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI, stateConfigAPI } from '../services/api';

/* ── helpers ──────────────────────────────────────────────────── */
const LANG_OPTIONS = [
  'English','Hindi','Gujarati','Marathi','Tamil',
  'Telugu','Bengali','Bodo','Punjabi','Assamese'
];
const parseLangs = (str) =>
  (str || '').split(',').map(s => s.trim()).filter(Boolean);
const joinLangs  = (arr) => arr.join(',');

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('states');

  /* ── State Config ─────────────────────────────────────────────── */
  const [states, setStates]             = useState([]);
  const [statesLoading, setStatesLoading] = useState(true);
  const [statesError, setStatesError]   = useState(null);
  const [showStateForm, setShowStateForm] = useState(false);
  const [editingState, setEditingState] = useState(null);
  const [stateForm, setStateForm]       = useState({ state_code: '', state_name: '', available_languages: [] });
  const [stateFormError, setStateFormError] = useState(null);
  const [savingState, setSavingState]   = useState(false);

  /* ── User Management ──────────────────────────────────────────── */
  const [users, setUsers]               = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError]     = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser]   = useState(null);
  const [createForm, setCreateForm]     = useState({ username: '', password: '', role: 'state', stateCode: '', isActive: true });
  const [editForm, setEditForm]         = useState({ password: '', role: '', stateCode: '', isActive: true });
  const [usersFormError, setUsersFormError] = useState(null);

  /* ── Loaders ──────────────────────────────────────────────────── */
  const loadStates = useCallback(async () => {
    try { setStatesLoading(true); setStatesError(null);
      setStates(await stateConfigAPI.getAll());
    } catch { setStatesError('Failed to load state configurations'); }
    finally { setStatesLoading(false); }
  }, []);

  const loadUsers = useCallback(async () => {
    try { setUsersLoading(true); setUsersError(null);
      setUsers(await adminAPI.getUsers());
    } catch { setUsersError('Failed to load users'); }
    finally { setUsersLoading(false); }
  }, []);

  useEffect(() => { loadStates(); loadUsers(); }, [loadStates, loadUsers]);

  /* ── State Config handlers ────────────────────────────────────── */
  const openAddState = () => {
    setStateForm({ state_code: '', state_name: '', available_languages: [] });
    setEditingState(null); setStateFormError(null); setShowStateForm(true);
  };
  const openEditState = (s) => {
    setStateForm({ state_code: s.state_code, state_name: s.state_name, available_languages: parseLangs(s.available_languages) });
    setEditingState(s.state_code); setStateFormError(null); setShowStateForm(true);
  };
  const toggleLang = (lang) => setStateForm(p => {
    const next = p.available_languages.includes(lang)
      ? p.available_languages.filter(l => l !== lang)
      : [...p.available_languages, lang];
    return { ...p, available_languages: next };
  });
  const handleSaveState = async (e) => {
    e.preventDefault(); setStateFormError(null);
    if (!stateForm.state_code.trim() || !stateForm.state_name.trim())
      return setStateFormError('State Code and State Name are required');
    if (!stateForm.available_languages.length)
      return setStateFormError('Select at least one language');
    try {
      setSavingState(true);
      const p = { state_code: stateForm.state_code.trim().toUpperCase(), state_name: stateForm.state_name.trim(), available_languages: joinLangs(stateForm.available_languages) };
      editingState ? await stateConfigAPI.update(editingState, { state_name: p.state_name, available_languages: p.available_languages })
                   : await stateConfigAPI.upsert(p);
      setShowStateForm(false); loadStates();
    } catch (err) { setStateFormError(err.response?.data?.error || 'Failed to save'); }
    finally { setSavingState(false); }
  };
  const handleDeleteState = async (sc) => {
    if (!window.confirm(`Delete state "${sc}"?`)) return;
    try { await stateConfigAPI.delete(sc); loadStates(); }
    catch (err) { alert(err.response?.data?.error || 'Failed to delete'); }
  };

  /* ── User handlers ────────────────────────────────────────────── */
  const handleCreate = async (e) => {
    e.preventDefault(); setUsersFormError(null);
    if (!createForm.username.trim() || !createForm.password.trim())
      return setUsersFormError('Username and password are required');
    if (createForm.role === 'state' && !createForm.stateCode.trim())
      return setUsersFormError('State code is required for state users');
    try {
      await adminAPI.createUser({ username: createForm.username.trim(), password: createForm.password,
        role: createForm.role, stateCode: createForm.role === 'admin' ? null : createForm.stateCode.trim(), isActive: createForm.isActive });
      setCreateForm({ username: '', password: '', role: 'state', stateCode: '', isActive: true });
      setShowCreateForm(false); loadUsers();
    } catch (err) { setUsersFormError(err.response?.data?.error || 'Failed to create user'); }
  };
  const startEdit = (u) => { setEditingUser(u.id); setEditForm({ password: '', role: u.role, stateCode: u.stateCode || '', isActive: u.isActive }); };
  const handleUpdate = async (uid) => {
    setUsersFormError(null);
    const updates = { isActive: editForm.isActive, role: editForm.role };
    if (editForm.password.trim()) updates.password = editForm.password;
    if (editForm.role === 'state') updates.stateCode = editForm.stateCode.trim();
    try { await adminAPI.updateUser(uid, updates); setEditingUser(null); loadUsers(); }
    catch (err) { setUsersFormError(err.response?.data?.error || 'Failed to update user'); }
  };

  return (
    <div className="admin-panel">
      {/* ── Header ── */}
      <div className="list-header">
        <h2 className="fw-bold" style={{ letterSpacing: '-0.02em' }}>Admin Panel</h2>
      </div>

      {/* ── Bootstrap Nav Tabs ── */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button className={`nav-link fw-semibold ${activeTab === 'states' ? 'active' : ''}`}
            onClick={() => setActiveTab('states')}>
            State Configuration
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link fw-semibold ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}>
            User Management
          </button>
        </li>
      </ul>

      {/* ══════════ STATE CONFIG TAB ══════════ */}
      {activeTab === 'states' && (
        <div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="fw-bold mb-0">State / U.T. Configuration</h5>
            <button className="btn btn-primary btn-sm" onClick={openAddState}>+ Add State</button>
          </div>

          {statesError && <div className="alert alert-danger py-2">{statesError}</div>}

          {showStateForm && (
            <div className="card mb-4 border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold">
                {editingState ? 'Edit State' : 'Add State'}
              </div>
              <div className="card-body">
                {stateFormError && <div className="alert alert-danger py-2 mb-3">{stateFormError}</div>}
                <form onSubmit={handleSaveState}>
                  <div className="row g-3 mb-3">
                    <div className="col-md-3">
                      <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>
                        State Code <span className="required">*</span>
                      </label>
                      <input type="text" className="form-control form-control-sm"
                        value={stateForm.state_code}
                        onChange={e => setStateForm(p => ({ ...p, state_code: e.target.value }))}
                        placeholder="e.g., HP, MH" maxLength={10}
                        disabled={!!editingState} />
                    </div>
                    <div className="col-md-5">
                      <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>
                        State / U.T. Name <span className="required">*</span>
                      </label>
                      <input type="text" className="form-control form-control-sm"
                        value={stateForm.state_name}
                        onChange={e => setStateForm(p => ({ ...p, state_name: e.target.value }))}
                        placeholder="e.g., Himachal Pradesh" />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>
                      Available Languages <span className="required">*</span>
                    </label>
                    <div className="lang-checkbox-grid">
                      {LANG_OPTIONS.map(lang => (
                        <label key={lang} className="lang-checkbox-item">
                          <input type="checkbox"
                            checked={stateForm.available_languages.includes(lang)}
                            onChange={() => toggleLang(lang)} />
                          {lang}
                        </label>
                      ))}
                    </div>
                    {stateForm.available_languages.length > 0 && (
                      <div className="lang-selected mt-1">
                        Selected: {stateForm.available_languages.join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-primary btn-sm" disabled={savingState}>
                      {savingState ? 'Saving…' : (editingState ? 'Update' : 'Create')}
                    </button>
                    <button type="button" className="btn btn-outline-secondary btn-sm"
                      onClick={() => setShowStateForm(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {statesLoading ? (
            <div className="text-center text-muted py-4">Loading…</div>
          ) : states.length === 0 ? (
            <div className="text-center text-muted py-5">
              <p>No states configured yet. Click <strong>+ Add State</strong> to start.</p>
            </div>
          ) : (
            <div className="card border-0 shadow-sm">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>State Code</th>
                      <th style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>State / U.T. Name</th>
                      <th style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available Languages</th>
                      <th style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {states.map(s => (
                      <tr key={s.state_code}>
                        <td><span className="badge bg-primary-subtle text-primary fw-semibold">{s.state_code}</span></td>
                        <td className="fw-medium">{s.state_name}</td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {parseLangs(s.available_languages).map(l => (
                              <span key={l} className="badge bg-secondary-subtle text-secondary" style={{ fontSize: '0.72rem' }}>{l}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="d-flex gap-2">
                            <button className="btn btn-outline-secondary btn-sm" onClick={() => openEditState(s)}>Edit</button>
                            <button className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteState(s.state_code)}>Delete</button>
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
      )}

      {/* ══════════ USER MANAGEMENT TAB ══════════ */}
      {activeTab === 'users' && (
        <div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="fw-bold mb-0">User Management</h5>
            <button className="btn btn-primary btn-sm"
              onClick={() => setShowCreateForm(v => !v)}>
              {showCreateForm ? 'Cancel' : '+ Create User'}
            </button>
          </div>

          {(usersError || usersFormError) && (
            <div className="alert alert-danger py-2">{usersError || usersFormError}</div>
          )}

          {showCreateForm && (
            <div className="card mb-4 border-0 shadow-sm">
              <div className="card-header bg-transparent fw-semibold">Create New User</div>
              <div className="card-body">
                <form onSubmit={handleCreate}>
                  <div className="row g-3 mb-3">
                    <div className="col-md-4">
                      <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>Username</label>
                      <input type="text" className="form-control form-control-sm"
                        value={createForm.username}
                        onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))}
                        placeholder="Enter username" />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>Password</label>
                      <input type="password" className="form-control form-control-sm"
                        value={createForm.password}
                        onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                        placeholder="Enter password" />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>Role</label>
                      <select className="form-select form-select-sm" value={createForm.role}
                        onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}>
                        <option value="state">State</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    {createForm.role === 'state' && (
                      <div className="col-md-2">
                        <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>State Code</label>
                        <input type="text" className="form-control form-control-sm"
                          value={createForm.stateCode}
                          onChange={e => setCreateForm(p => ({ ...p, stateCode: e.target.value }))}
                          placeholder="e.g., MH" />
                      </div>
                    )}
                    <div className="col-md-2">
                      <label className="form-label fw-semibold" style={{ fontSize: '0.8rem' }}>Status</label>
                      <select className="form-select form-select-sm"
                        value={createForm.isActive ? 'active' : 'inactive'}
                        onChange={e => setCreateForm(p => ({ ...p, isActive: e.target.value === 'active' }))}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-primary btn-sm">Create User</button>
                    <button type="button" className="btn btn-outline-secondary btn-sm"
                      onClick={() => setShowCreateForm(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {usersLoading ? (
            <div className="text-center text-muted py-4">Loading users…</div>
          ) : (
            <div className="card border-0 shadow-sm">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      {['ID','Username','Role','State Code','Status','Actions'].map(h => (
                        <th key={h} style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        {editingUser === u.id ? (
                          <>
                            <td className="text-muted">{u.id}</td>
                            <td className="fw-medium">{u.username}</td>
                            <td>
                              <select className="form-select form-select-sm" style={{ width: 90 }}
                                value={editForm.role}
                                onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}>
                                <option value="state">State</option>
                                <option value="admin">Admin</option>
                              </select>
                            </td>
                            <td>
                              {editForm.role === 'state'
                                ? <input type="text" className="input-sm" style={{ width: 80 }}
                                    value={editForm.stateCode}
                                    onChange={e => setEditForm(p => ({ ...p, stateCode: e.target.value }))}
                                    placeholder="Code" />
                                : <span className="text-muted">—</span>}
                            </td>
                            <td>
                              <select className="form-select form-select-sm" style={{ width: 100 }}
                                value={editForm.isActive ? 'active' : 'inactive'}
                                onChange={e => setEditForm(p => ({ ...p, isActive: e.target.value === 'active' }))}>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </td>
                            <td>
                              <div className="d-flex gap-2 align-items-center flex-wrap">
                                <input type="password" className="input-sm" style={{ width: 140 }}
                                  value={editForm.password}
                                  onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                                  placeholder="New password (opt.)" />
                                <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(u.id)}>Save</button>
                                <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditingUser(null)}>Cancel</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="text-muted" style={{ fontSize: '0.85rem' }}>{u.id}</td>
                            <td className="fw-medium">{u.username}</td>
                            <td>
                              <span className={`badge ${u.role === 'admin' ? 'bg-primary' : 'bg-secondary'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td>{u.stateCode || <span className="text-muted">—</span>}</td>
                            <td>
                              <span className={`badge ${u.isActive ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`}>
                                {u.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <button className="btn btn-outline-secondary btn-sm" onClick={() => startEdit(u)}>Edit</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
