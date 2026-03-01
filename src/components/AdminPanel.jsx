import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI, stateConfigAPI } from '../services/api';

/* ─── helpers ──────────────────────────────────────────────────────────────── */
const LANG_OPTIONS = [
  'English','Hindi','Gujarati','Marathi','Tamil',
  'Telugu','Bengali','Bodo','Punjabi','Assamese'
];

/* parse comma-separated languages string → array */
const parseLangs = (str) =>
  (str || '').split(',').map(s => s.trim()).filter(Boolean);

/* array → comma-separated string */
const joinLangs = (arr) => arr.join(',');

/* ─────────────────────────────────────────────────────────────────────────── */
const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('states'); // 'states' | 'users'

  /* ── State Config ───────────────────────────────────────────────────────── */
  const [states, setStates]             = useState([]);
  const [statesLoading, setStatesLoading] = useState(true);
  const [statesError, setStatesError]   = useState(null);
  const [showStateForm, setShowStateForm] = useState(false);
  const [editingState, setEditingState] = useState(null); // state_code being edited
  const [stateForm, setStateForm]       = useState({ state_code: '', state_name: '', available_languages: [] });
  const [stateFormError, setStateFormError] = useState(null);
  const [savingState, setSavingState]   = useState(false);

  /* ── User Management ────────────────────────────────────────────────────── */
  const [users, setUsers]               = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError]     = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser]   = useState(null);
  const [createForm, setCreateForm]     = useState({
    username: '', password: '', role: 'state', stateCode: '', isActive: true
  });
  const [editForm, setEditForm]         = useState({
    password: '', role: '', stateCode: '', isActive: true
  });
  const [usersFormError, setUsersFormError] = useState(null);

  /* ── Load functions ─────────────────────────────────────────────────────── */
  const loadStates = useCallback(async () => {
    try {
      setStatesLoading(true);
      setStatesError(null);
      const data = await stateConfigAPI.getAll();
      setStates(data);
    } catch {
      setStatesError('Failed to load state configurations');
    } finally {
      setStatesLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      setUsersError(null);
      const data = await adminAPI.getUsers();
      setUsers(data);
    } catch {
      setUsersError('Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => { loadStates(); loadUsers(); }, [loadStates, loadUsers]);

  /* ── State Config Handlers ──────────────────────────────────────────────── */
  const openAddState = () => {
    setStateForm({ state_code: '', state_name: '', available_languages: [] });
    setEditingState(null);
    setStateFormError(null);
    setShowStateForm(true);
  };

  const openEditState = (s) => {
    setStateForm({
      state_code: s.state_code,
      state_name: s.state_name,
      available_languages: parseLangs(s.available_languages)
    });
    setEditingState(s.state_code);
    setStateFormError(null);
    setShowStateForm(true);
  };

  const toggleLang = (lang) => {
    setStateForm(prev => {
      const curr = prev.available_languages;
      const next = curr.includes(lang) ? curr.filter(l => l !== lang) : [...curr, lang];
      return { ...prev, available_languages: next };
    });
  };

  const handleSaveState = async (e) => {
    e.preventDefault();
    setStateFormError(null);
    if (!stateForm.state_code.trim() || !stateForm.state_name.trim()) {
      setStateFormError('State Code and State Name are required');
      return;
    }
    if (stateForm.available_languages.length === 0) {
      setStateFormError('Select at least one language');
      return;
    }
    try {
      setSavingState(true);
      const payload = {
        state_code: stateForm.state_code.trim().toUpperCase(),
        state_name: stateForm.state_name.trim(),
        available_languages: joinLangs(stateForm.available_languages)
      };
      if (editingState) {
        await stateConfigAPI.update(editingState, {
          state_name: payload.state_name,
          available_languages: payload.available_languages
        });
      } else {
        await stateConfigAPI.upsert(payload);
      }
      setShowStateForm(false);
      loadStates();
    } catch (err) {
      setStateFormError(err.response?.data?.error || 'Failed to save state config');
    } finally {
      setSavingState(false);
    }
  };

  const handleDeleteState = async (stateCode) => {
    if (!window.confirm(`Delete state "${stateCode}"? This cannot be undone.`)) return;
    try {
      await stateConfigAPI.delete(stateCode);
      loadStates();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete state config');
    }
  };

  /* ── User Handlers ──────────────────────────────────────────────────────── */
  const handleCreate = async (e) => {
    e.preventDefault();
    setUsersFormError(null);
    if (!createForm.username.trim() || !createForm.password.trim()) {
      setUsersFormError('Username and password are required');
      return;
    }
    if (createForm.role === 'state' && !createForm.stateCode.trim()) {
      setUsersFormError('State code is required for state users');
      return;
    }
    try {
      await adminAPI.createUser({
        username: createForm.username.trim(),
        password: createForm.password,
        role: createForm.role,
        stateCode: createForm.role === 'admin' ? null : createForm.stateCode.trim(),
        isActive: createForm.isActive
      });
      setCreateForm({ username: '', password: '', role: 'state', stateCode: '', isActive: true });
      setShowCreateForm(false);
      loadUsers();
    } catch (err) {
      setUsersFormError(err.response?.data?.error || 'Failed to create user');
    }
  };

  const startEdit = (user) => {
    setEditingUser(user.id);
    setEditForm({
      password: '', role: user.role, stateCode: user.stateCode || '', isActive: user.isActive
    });
  };

  const handleUpdate = async (userId) => {
    setUsersFormError(null);
    const updates = {};
    if (editForm.password.trim())  updates.password  = editForm.password;
    if (editForm.role)             updates.role      = editForm.role;
    if (editForm.role === 'state') updates.stateCode = editForm.stateCode.trim();
    updates.isActive = editForm.isActive;
    try {
      await adminAPI.updateUser(userId, updates);
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      setUsersFormError(err.response?.data?.error || 'Failed to update user');
    }
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="admin-panel">
      <div className="list-header">
        <h2>Admin Panel</h2>
        <div className="admin-tabs">
          <button
            className={`btn ${activeTab === 'states' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('states')}
          >
            State Configuration
          </button>
          <button
            className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('users')}
          >
            User Management
          </button>
        </div>
      </div>

      {/* ── STATE CONFIG TAB ──────────────────────────────────────────────── */}
      {activeTab === 'states' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>State Configuration</h3>
            <button className="btn btn-primary" onClick={openAddState}>+ Add State</button>
          </div>

          {statesError && <div className="error-message">{statesError}</div>}

          {showStateForm && (
            <div className="admin-form-card">
              <h3>{editingState ? 'Edit State' : 'Add State'}</h3>
              {stateFormError && <div className="error-message" style={{ marginBottom: '1rem' }}>{stateFormError}</div>}
              <form onSubmit={handleSaveState}>
                <div className="form-row">
                  <div className="form-group">
                    <label>State Code <span className="required">*</span></label>
                    <input
                      type="text"
                      value={stateForm.state_code}
                      onChange={e => setStateForm(p => ({ ...p, state_code: e.target.value }))}
                      placeholder="e.g., HP, MH, KA"
                      maxLength={10}
                      disabled={!!editingState}
                    />
                  </div>
                  <div className="form-group">
                    <label>State / U.T. Name <span className="required">*</span></label>
                    <input
                      type="text"
                      value={stateForm.state_name}
                      onChange={e => setStateForm(p => ({ ...p, state_name: e.target.value }))}
                      placeholder="e.g., Himachal Pradesh"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Available Languages <span className="required">*</span></label>
                  <div className="lang-checkbox-grid">
                    {LANG_OPTIONS.map(lang => (
                      <label key={lang} className="lang-checkbox-item">
                        <input
                          type="checkbox"
                          checked={stateForm.available_languages.includes(lang)}
                          onChange={() => toggleLang(lang)}
                        />
                        {lang}
                      </label>
                    ))}
                  </div>
                  {stateForm.available_languages.length > 0 && (
                    <div className="lang-selected">
                      Selected: {stateForm.available_languages.join(', ')}
                    </div>
                  )}
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={savingState}>
                    {savingState ? 'Saving…' : (editingState ? 'Update' : 'Create')}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowStateForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {statesLoading ? (
            <div className="loading">Loading state configurations…</div>
          ) : states.length === 0 ? (
            <div className="empty-state">
              <p>No states configured yet. Click <strong>+ Add State</strong> to start.</p>
            </div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>State Code</th>
                    <th>State / U.T. Name</th>
                    <th>Available Languages</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {states.map(s => (
                    <tr key={s.state_code}>
                      <td><strong>{s.state_code}</strong></td>
                      <td>{s.state_name}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          {parseLangs(s.available_languages).map(l => (
                            <span key={l} className="badge badge-state" style={{ fontSize: '0.75rem' }}>{l}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEditState(s)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteState(s.state_code)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── USER MANAGEMENT TAB ───────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>User Management</h3>
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              {showCreateForm ? 'Cancel' : '+ Create User'}
            </button>
          </div>

          {usersError && <div className="error-message">{usersError}</div>}
          {usersFormError && <div className="error-message">{usersFormError}</div>}

          {showCreateForm && (
            <div className="admin-form-card">
              <h3>Create New User</h3>
              <form onSubmit={handleCreate}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="create-username">Username</label>
                    <input
                      id="create-username"
                      type="text"
                      value={createForm.username}
                      onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))}
                      placeholder="Enter username"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="create-password">Password</label>
                    <input
                      id="create-password"
                      type="password"
                      value={createForm.password}
                      onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="Enter password"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="create-role">Role</label>
                    <select
                      id="create-role"
                      value={createForm.role}
                      onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}
                    >
                      <option value="state">State</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  {createForm.role === 'state' && (
                    <div className="form-group">
                      <label htmlFor="create-stateCode">State Code</label>
                      <input
                        id="create-stateCode"
                        type="text"
                        value={createForm.stateCode}
                        onChange={e => setCreateForm(p => ({ ...p, stateCode: e.target.value }))}
                        placeholder="e.g., MH, KA, TN"
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label htmlFor="create-active">Status</label>
                    <select
                      id="create-active"
                      value={createForm.isActive ? 'active' : 'inactive'}
                      onChange={e => setCreateForm(p => ({ ...p, isActive: e.target.value === 'active' }))}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">Create User</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {usersLoading ? (
            <div className="loading">Loading users…</div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>State Code</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      {editingUser === user.id ? (
                        <>
                          <td>{user.id}</td>
                          <td>{user.username}</td>
                          <td>
                            <select
                              value={editForm.role}
                              onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                            >
                              <option value="state">State</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td>
                            {editForm.role === 'state' ? (
                              <input
                                type="text"
                                value={editForm.stateCode}
                                onChange={e => setEditForm(p => ({ ...p, stateCode: e.target.value }))}
                                placeholder="State code"
                                className="input-sm"
                              />
                            ) : <span className="text-muted">N/A</span>}
                          </td>
                          <td>
                            <select
                              value={editForm.isActive ? 'active' : 'inactive'}
                              onChange={e => setEditForm(p => ({ ...p, isActive: e.target.value === 'active' }))}
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </td>
                          <td>
                            <div className="admin-edit-actions">
                              <input
                                type="password"
                                value={editForm.password}
                                onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                                placeholder="New password (optional)"
                                className="input-sm"
                              />
                              <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(user.id)}>Save</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setEditingUser(null)}>Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{user.id}</td>
                          <td>{user.username}</td>
                          <td><span className={`badge ${user.role === 'admin' ? 'badge-admin' : 'badge-state'}`}>{user.role}</span></td>
                          <td>{user.stateCode || <span className="text-muted">N/A</span>}</td>
                          <td><span className={`badge ${user.isActive ? 'badge-active' : 'badge-inactive'}`}>{user.isActive ? 'Active' : 'Inactive'}</span></td>
                          <td>
                            <button className="btn btn-secondary btn-sm" onClick={() => startEdit(user)}>Edit</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
