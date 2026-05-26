import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminAPI, stateConfigAPI } from '../services/api';
import { useToast } from './Toast';

/* ── helpers ──────────────────────────────────────────────────── */
const LANG_OPTIONS = [
  'English','Hindi','Gujarati','Marathi','Tamil',
  'Telugu','Bengali','Bodo','Punjabi','Assamese'
];
const parseLangs = (str) =>
  (str || '').split(',').map(s => s.trim()).filter(Boolean);
const joinLangs  = (arr) => arr.join(',');

// LEGACY LOGIN — legacy create form disabled entirely.
const SHOW_LEGACY_CREATE = false;

// Keep this in sync with EMAIL_RE in Survey-builder-BE/routes/admin.js
// (intentionally permissive — the canonical check happens server-side).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fmtDate = (v) => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return '—';
  }
};

const TABS = ['states', 'users'];
function readInitialTab(search) {
  const params = new URLSearchParams(search || '');
  const t = params.get('tab');
  return TABS.includes(t) ? t : 'states';
}

const AdminPanel = () => {
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  // Tab is driven by ?tab=… so that deep-links land on the right section
  // ("/admin?tab=users") and the back/forward buttons feel right.
  const [activeTab, setActiveTab] = useState(() => readInitialTab(location.search));

  // Keep tab in sync if user navigates via back/forward.
  useEffect(() => {
    const next = readInitialTab(location.search);
    setActiveTab(prev => (prev === next ? prev : next));
  }, [location.search]);

  const switchTab = useCallback((tab) => {
    if (!TABS.includes(tab) || tab === activeTab) return;
    const params = new URLSearchParams(location.search);
    params.set('tab', tab);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: false });
  }, [activeTab, location.pathname, location.search, navigate]);

  /* ── State Config ─────────────────────────────────────────────── */
  const [states, setStates]               = useState([]);
  const [statesLoading, setStatesLoading] = useState(true);
  const [statesError, setStatesError]     = useState(null);
  const [showStateForm, setShowStateForm] = useState(false);
  const [editingState, setEditingState]   = useState(null);
  const [stateForm, setStateForm]         = useState({ state_code: '', state_name: '', available_languages: [] });
  const [stateFormError, setStateFormError] = useState(null);
  const [savingState, setSavingState]     = useState(false);

  /* ── User Management ──────────────────────────────────────────── */
  const [users, setUsers]               = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError]     = useState(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showLegacyCreate, setShowLegacyCreate] = useState(false);
  const [editingUser, setEditingUser]   = useState(null);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'state', stateCode: '', isActive: true });
  const [legacyForm, setLegacyForm] = useState({ username: '', password: '', role: 'state', stateCode: '', isActive: true });
  const [editForm, setEditForm]         = useState({ password: '', role: '', stateCode: '', name: '', isActive: true });
  const [usersFormError, setUsersFormError] = useState(null);
  // Per-form fine-grained validation, keyed by field name. The Add-User form
  // reads these to render an inline message under the offending input rather
  // than a single blob at the top of the form. Cleared on input change.
  const [inviteFieldErrors, setInviteFieldErrors] = useState({});
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const emailInputRef = useRef(null);

  // Attach-email modal state
  const [attachTarget, setAttachTarget] = useState(null);   // user row or null
  const [attachForm, setAttachForm]     = useState({ email: '', name: '' });
  const [attachError, setAttachError]   = useState(null);
  const [attachSaving, setAttachSaving] = useState(false);

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
      const p = {
        state_code: stateForm.state_code.trim().toUpperCase(),
        state_name: stateForm.state_name.trim(),
        available_languages: joinLangs(stateForm.available_languages)
      };
      editingState
        ? await stateConfigAPI.update(editingState, { state_name: p.state_name, available_languages: p.available_languages })
        : await stateConfigAPI.upsert(p);
      setShowStateForm(false); loadStates();
    } catch (err) { setStateFormError(err.response?.data?.error || 'Failed to save'); }
    finally { setSavingState(false); }
  };
  const handleDeleteState = async (sc) => {
    if (!window.confirm(`Delete state "${sc}"?`)) return;
    try { await stateConfigAPI.delete(sc); loadStates(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
  };

  /* ── User handlers ────────────────────────────────────────────── */
  const openInviteForm = useCallback(() => {
    setShowInviteForm(true);
    setShowLegacyCreate(false);
    setUsersFormError(null);
    setInviteFieldErrors({});
    // Defer focus until after the form mounts.
    setTimeout(() => emailInputRef.current?.focus(), 0);
  }, []);

  const closeInviteForm = useCallback(() => {
    setShowInviteForm(false);
    setUsersFormError(null);
    setInviteFieldErrors({});
  }, []);

  const validateInvite = (form) => {
    const errors = {};
    const email = (form.email || '').trim().toLowerCase();
    if (!email) {
      errors.email = 'Email is required';
    } else if (!EMAIL_RE.test(email)) {
      errors.email = 'Enter a valid email address';
    }
    if (!['admin', 'state'].includes(form.role)) {
      errors.role = 'Role must be admin or state';
    }
    if (form.role === 'state' && !form.stateCode) {
      errors.stateCode = 'State is required for state users';
    }
    return errors;
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (submittingInvite) return; // hard guard against double-submit
    setUsersFormError(null);
    setInviteFieldErrors({});

    const errors = validateInvite(inviteForm);
    if (Object.keys(errors).length > 0) {
      setInviteFieldErrors(errors);
      // Also surface a top-level summary for screen readers / quick scan.
      setUsersFormError(Object.values(errors)[0]);
      return;
    }

    const email = inviteForm.email.trim().toLowerCase();
    try {
      setSubmittingInvite(true);
      await adminAPI.createUser({
        email,
        name: inviteForm.name.trim() || null,
        role: inviteForm.role,
        stateCode: inviteForm.role === 'admin' ? null : inviteForm.stateCode
      });
      setInviteForm({ email: '', name: '', role: 'state', stateCode: '', isActive: true });
      setShowInviteForm(false);
      setInviteFieldErrors({});
      toast.success(`User added: ${email}`);
      loadUsers();
    } catch (err) {
      const status = err.response?.status;
      const apiErr = err.response?.data?.error || err.response?.data?.message;
      // Map known backend statuses to friendly, field-targeted UX. Keep the
      // form OPEN with the user's inputs intact so they can fix and retry.
      if (status === 409) {
        setInviteFieldErrors({ email: 'A user with this email already exists' });
        setUsersFormError('A user with this email already exists.');
      } else if (status === 400 && /email/i.test(apiErr || '')) {
        setInviteFieldErrors({ email: apiErr || 'Invalid email' });
        setUsersFormError(apiErr || 'Invalid email');
      } else if (status === 400 && /state/i.test(apiErr || '')) {
        setInviteFieldErrors({ stateCode: apiErr || 'State is required' });
        setUsersFormError(apiErr || 'State is required');
      } else if (status === 401) {
        setUsersFormError('Your session has expired. Please sign in again.');
      } else if (status === 403) {
        setUsersFormError("You don't have permission to add users.");
      } else {
        // eslint-disable-next-line no-console
        console.error('Add user failed:', status, err.response?.data || err.message);
        setUsersFormError(apiErr || `Failed to add user (${status || 'network'}). Please try again.`);
      }
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleLegacyCreate = async (e) => {
    e.preventDefault(); setUsersFormError(null);
    if (!legacyForm.username.trim() || !legacyForm.password.trim())
      return setUsersFormError('Username and password are required');
    if (legacyForm.role === 'state' && !legacyForm.stateCode)
      return setUsersFormError('State is required for state users');
    try {
      await adminAPI.createUser({
        username: legacyForm.username.trim(),
        password: legacyForm.password,
        role: legacyForm.role,
        stateCode: legacyForm.role === 'admin' ? null : legacyForm.stateCode
      });
      setLegacyForm({ username: '', password: '', role: 'state', stateCode: '', isActive: true });
      setShowLegacyCreate(false);
      loadUsers();
    } catch (err) { setUsersFormError(err.response?.data?.error || 'Failed to create user'); }
  };

  const startEdit = (u) => {
    setEditingUser(u.id);
    setEditForm({ password: '', role: u.role, stateCode: u.stateCode || '', name: u.name || '', isActive: u.isActive });
  };
  const handleUpdate = async (uid) => {
    setUsersFormError(null);
    const updates = { isActive: editForm.isActive, role: editForm.role, name: editForm.name };
    if (editForm.password.trim()) updates.password = editForm.password;
    if (editForm.role === 'state') updates.stateCode = editForm.stateCode;
    try { await adminAPI.updateUser(uid, updates); setEditingUser(null); loadUsers(); }
    catch (err) { setUsersFormError(err.response?.data?.error || 'Failed to update user'); }
  };

  const openAttach = (u) => {
    setAttachTarget(u);
    setAttachForm({ email: '', name: u.name || '' });
    setAttachError(null);
  };
  const handleAttach = async (e) => {
    e.preventDefault();
    if (!attachTarget) return;
    const email = (attachForm.email || '').trim().toLowerCase();
    if (!email) return setAttachError('Email is required');
    try {
      setAttachSaving(true);
      await adminAPI.attachEmail(attachTarget.id, { email, name: attachForm.name.trim() || null });
      setAttachTarget(null);
      toast.success(`Linked ${attachTarget.username || `#${attachTarget.id}`} to ${email}`);
      loadUsers();
    } catch (err) {
      setAttachError(err.response?.data?.error || 'Failed to attach email');
    } finally {
      setAttachSaving(false);
    }
  };

  const authSourceBadge = (u) => {
    if (u.email && u.username) return <span className="badge">Both</span>;
    if (u.email)               return <span className="badge badge-state">Google</span>;
    if (u.username)            return <span className="badge">Legacy</span>;
    return <span className="text-muted">—</span>;
  };

  return (
    <div className="admin-panel">

      {/* ── Header ── */}
      <div className="list-header">
        <h2>Admin Panel</h2>
      </div>

      {/* ── Tabs ── */}
      <div className="admin-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'states'}
          className={`admin-tab${activeTab === 'states' ? ' active' : ''}`}
          onClick={() => switchTab('states')}
        >
          State Configuration
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'users'}
          className={`admin-tab${activeTab === 'users' ? ' active' : ''}`}
          onClick={() => switchTab('users')}
        >
          User Management
        </button>
      </div>

      {/* ══════════ STATE CONFIG TAB ══════════ */}
      {activeTab === 'states' && (
        <div>
          <div className="list-header" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-1)' }}>
              State / U.T. Configuration
            </h3>
            <button className="btn btn-primary btn-sm btn-cta btn-icon-add" onClick={openAddState}>Add State</button>
          </div>

          {statesError && <div className="error-message">{statesError}</div>}

          {showStateForm && (
            <div className="admin-form-card">
              <h3>{editingState ? 'Edit State' : 'Add State'}</h3>
              {stateFormError && <div className="error-message">{stateFormError}</div>}
              <form onSubmit={handleSaveState}>
                <div className="form-row">
                  <div className="form-group">
                    <label>State Code <span className="required">*</span></label>
                    <input
                      type="text"
                      value={stateForm.state_code}
                      onChange={e => setStateForm(p => ({ ...p, state_code: e.target.value }))}
                      placeholder="e.g., HP, MH"
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
                  <button type="submit" className={`btn btn-primary btn-sm btn-cta ${editingState ? 'btn-icon-update' : 'btn-icon-create'}`} disabled={savingState}>
                    {savingState ? 'Saving…' : (editingState ? 'Update' : 'Create')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-cta btn-icon-cancel"
                    onClick={() => setShowStateForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {statesLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '3rem' }}>Loading…</div>
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
                      <td><span className="badge badge-state">{s.state_code}</span></td>
                      <td style={{ fontWeight: 500, color: 'var(--text-1)' }}>{s.state_name}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {parseLangs(s.available_languages).map(l => (
                            <span key={l} className="badge">{l}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-secondary btn-sm btn-edit btn-cta btn-icon-edit" onClick={() => openEditState(s)}>Edit</button>
                          <button className="btn btn-danger btn-sm btn-cta btn-icon-delete" onClick={() => handleDeleteState(s.state_code)}>Delete</button>
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

      {/* ══════════ USER MANAGEMENT TAB ══════════ */}
      {activeTab === 'users' && (
        <div>
          <div className="list-header" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-1)' }}>
              User Management
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                aria-expanded={showInviteForm}
                aria-controls="add-user-form"
                className={`btn btn-primary btn-sm btn-cta ${showInviteForm ? 'btn-icon-cancel' : 'btn-icon-create'}`}
                onClick={() => (showInviteForm ? closeInviteForm() : openInviteForm())}
              >
                {showInviteForm ? 'Cancel' : 'Add User'}
              </button>
              {SHOW_LEGACY_CREATE && (
                <button
                  className="btn btn-secondary btn-sm btn-cta"
                  onClick={() => { setShowLegacyCreate(v => !v); setShowInviteForm(false); }}
                  title="Create a username/password user (legacy path)"
                >
                  {showLegacyCreate ? 'Hide legacy' : 'Legacy create'}
                </button>
              )}
            </div>
          </div>

          {/* Load-level error (list failed to fetch) — separate from submit error.
              Always offers a Retry button instead of leaving the user stuck. */}
          {usersError && (
            <div className="error-message" role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span>{usersError}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadUsers}>
                Retry
              </button>
            </div>
          )}

          {showInviteForm && (
            <div className="admin-form-card" id="add-user-form">
              <h3>Add User</h3>
              <p className="text-muted" style={{ marginTop: 0 }}>
                The user will sign in via Google with this exact email. No password is needed.
              </p>
              {usersFormError && (
                <div className="error-message" role="alert" data-testid="invite-form-error">{usersFormError}</div>
              )}
              <form onSubmit={handleAddUser} noValidate>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="invite-email">Email <span className="required">*</span></label>
                    <input
                      id="invite-email"
                      ref={emailInputRef}
                      type="email"
                      autoComplete="email"
                      value={inviteForm.email}
                      aria-invalid={!!inviteFieldErrors.email}
                      aria-describedby={inviteFieldErrors.email ? 'invite-email-err' : undefined}
                      onChange={e => {
                        const v = e.target.value;
                        setInviteForm(p => ({ ...p, email: v }));
                        if (inviteFieldErrors.email) {
                          setInviteFieldErrors(err => ({ ...err, email: undefined }));
                        }
                      }}
                      placeholder="someone@example.com"
                      disabled={submittingInvite}
                    />
                    {inviteFieldErrors.email && (
                      <div id="invite-email-err" className="field-error" style={{ color: 'var(--danger, #c33)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        {inviteFieldErrors.email}
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="invite-name">Name</label>
                    <input
                      id="invite-name"
                      type="text"
                      autoComplete="name"
                      value={inviteForm.name}
                      onChange={e => setInviteForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Display name (optional)"
                      disabled={submittingInvite}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="invite-role">Role</label>
                    <select
                      id="invite-role"
                      value={inviteForm.role}
                      onChange={e => setInviteForm(p => ({ ...p, role: e.target.value, stateCode: e.target.value === 'admin' ? '' : p.stateCode }))}
                      disabled={submittingInvite}
                    >
                      <option value="state">State</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  {inviteForm.role === 'state' && (
                    <div className="form-group">
                      <label htmlFor="invite-state">State <span className="required">*</span></label>
                      <select
                        id="invite-state"
                        value={inviteForm.stateCode}
                        aria-invalid={!!inviteFieldErrors.stateCode}
                        aria-describedby={inviteFieldErrors.stateCode ? 'invite-state-err' : undefined}
                        onChange={e => {
                          const v = e.target.value;
                          setInviteForm(p => ({ ...p, stateCode: v }));
                          if (inviteFieldErrors.stateCode) {
                            setInviteFieldErrors(err => ({ ...err, stateCode: undefined }));
                          }
                        }}
                        disabled={submittingInvite || statesLoading}
                      >
                        <option value="">
                          {statesLoading ? 'Loading states…' : (states.length ? 'Select a state…' : 'No states available')}
                        </option>
                        {states.map(s => (
                          <option key={s.state_code} value={s.state_code}>
                            {s.state_code} — {s.state_name}
                          </option>
                        ))}
                      </select>
                      {/* If state config failed to load, tell the user why and how to recover */}
                      {!statesLoading && states.length === 0 && (
                        <div className="field-error" style={{ color: 'var(--text-3)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                          {statesError
                            ? <>States failed to load. <button type="button" className="link" onClick={loadStates}>Retry</button></>
                            : 'No states configured. Add a state first, then come back.'}
                        </div>
                      )}
                      {inviteFieldErrors.stateCode && (
                        <div id="invite-state-err" className="field-error" style={{ color: 'var(--danger, #c33)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                          {inviteFieldErrors.stateCode}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm btn-cta btn-icon-create"
                    disabled={submittingInvite}
                    aria-busy={submittingInvite}
                    data-testid="invite-submit"
                  >
                    {submittingInvite ? 'Adding…' : 'Add User'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-cta btn-icon-cancel"
                    onClick={closeInviteForm}
                    disabled={submittingInvite}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {SHOW_LEGACY_CREATE && showLegacyCreate && (
            <div className="admin-form-card">
              <h3>Create Legacy User (username + password)</h3>
              <p className="text-muted" style={{ marginTop: 0 }}>
                Use only during the migration window. Prefer "Invite User" for new accounts.
              </p>
              <form onSubmit={handleLegacyCreate}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Username</label>
                    <input
                      type="text"
                      value={legacyForm.username}
                      onChange={e => setLegacyForm(p => ({ ...p, username: e.target.value }))}
                      placeholder="Enter username"
                    />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input
                      type="password"
                      value={legacyForm.password}
                      onChange={e => setLegacyForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="Enter password"
                    />
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <select
                      value={legacyForm.role}
                      onChange={e => setLegacyForm(p => ({ ...p, role: e.target.value }))}
                    >
                      <option value="state">State</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  {legacyForm.role === 'state' && (
                    <div className="form-group">
                      <label>State</label>
                      <select
                        value={legacyForm.stateCode}
                        onChange={e => setLegacyForm(p => ({ ...p, stateCode: e.target.value }))}
                      >
                        <option value="">Select a state…</option>
                        {states.map(s => (
                          <option key={s.state_code} value={s.state_code}>
                            {s.state_code} — {s.state_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary btn-sm btn-cta btn-icon-create">Create</button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-cta btn-icon-cancel"
                    onClick={() => setShowLegacyCreate(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {usersLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '3rem' }} data-testid="users-loading">
              Loading users…
            </div>
          ) : users.length === 0 && !usersError ? (
            <div className="empty-state" data-testid="users-empty">
              <p>No users yet. Click <strong>Add User</strong> to invite someone by email.</p>
            </div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table" data-testid="users-table">
                <thead>
                  <tr>
                    {['ID', 'Identity', 'Auth', 'Role', 'State', 'Status', 'Invited / Last login', 'Actions'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      {editingUser === u.id ? (
                        <>
                          <td className="text-muted">{u.id}</td>
                          <td style={{ fontWeight: 500, color: 'var(--text-1)' }}>
                            <div>{u.email || u.username || '—'}</div>
                            <input
                              type="text"
                              className="input-sm"
                              value={editForm.name}
                              onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                              placeholder="Name"
                              style={{ marginTop: '0.25rem' }}
                            />
                          </td>
                          <td>{authSourceBadge(u)}</td>
                          <td>
                            <select
                              style={{ width: 90 }}
                              value={editForm.role}
                              onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                            >
                              <option value="state">State</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td>
                            {editForm.role === 'state' ? (
                              <select
                                value={editForm.stateCode}
                                onChange={e => setEditForm(p => ({ ...p, stateCode: e.target.value }))}
                              >
                                <option value="">Select…</option>
                                {states.map(s => (
                                  <option key={s.state_code} value={s.state_code}>{s.state_code}</option>
                                ))}
                              </select>
                            ) : <span className="text-muted">—</span>}
                          </td>
                          <td>
                            <select
                              style={{ width: 100 }}
                              value={editForm.isActive ? 'active' : 'inactive'}
                              onChange={e => setEditForm(p => ({ ...p, isActive: e.target.value === 'active' }))}
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </td>
                          <td className="text-muted">
                            <div>Inv: {fmtDate(u.invitedAt)}</div>
                            <div>Last: {fmtDate(u.lastLoginAt)}</div>
                          </td>
                          <td>
                            <div className="admin-edit-actions">
                              {u.username && (
                                <input
                                  type="password"
                                  className="input-sm"
                                  style={{ width: 140 }}
                                  value={editForm.password}
                                  onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                                  placeholder="New password (opt.)"
                                />
                              )}
                              <button className="btn btn-primary btn-sm btn-cta btn-icon-save" onClick={() => handleUpdate(u.id)}>Save</button>
                              <button className="btn btn-secondary btn-sm btn-cta btn-icon-cancel" onClick={() => setEditingUser(null)}>Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="text-muted">{u.id}</td>
                          <td style={{ fontWeight: 500, color: 'var(--text-1)' }}>
                            <div>{u.email || u.username || '—'}</div>
                            {u.name && <div className="text-muted" style={{ fontSize: '0.8rem' }}>{u.name}</div>}
                          </td>
                          <td>{authSourceBadge(u)}</td>
                          <td>
                            <span className={`badge ${u.role === 'admin' ? 'badge-role-admin' : ''}`}>
                              {u.role}
                            </span>
                          </td>
                          <td>{u.stateCode || <span className="text-muted">—</span>}</td>
                          <td>
                            <span className={`badge ${u.isActive ? 'badge-active' : 'badge-inactive'}`}>
                              {u.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                            <div>Inv: {fmtDate(u.invitedAt)}</div>
                            <div>Last: {fmtDate(u.lastLoginAt)}</div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <button className="btn btn-secondary btn-sm btn-edit btn-cta btn-icon-edit" onClick={() => startEdit(u)}>Edit</button>
                              {!u.email && (
                                <button
                                  className="btn btn-secondary btn-sm btn-cta"
                                  onClick={() => openAttach(u)}
                                  title="Attach an email so this user can sign in with Google"
                                >
                                  Convert
                                </button>
                              )}
                            </div>
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

      {/* ══════════ ATTACH EMAIL MODAL ══════════ */}
      {attachTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}
          onClick={() => setAttachTarget(null)}
        >
          <div
            className="admin-form-card"
            style={{ maxWidth: '500px', width: '90%' }}
            onClick={e => e.stopPropagation()}
          >
            <h3>Convert "{attachTarget.username || `#${attachTarget.id}`}" to Google sign-in</h3>
            <p className="text-muted">
              Attaching an email lets this user sign in with Google. The username/password
              login keeps working until you set <code>LEGACY_LOGIN_ENABLED=false</code>.
            </p>
            {attachError && <div className="error-message">{attachError}</div>}
            <form onSubmit={handleAttach}>
              <div className="form-group">
                <label>Email <span className="required">*</span></label>
                <input
                  type="email"
                  value={attachForm.email}
                  onChange={e => setAttachForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="user@example.com"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={attachForm.name}
                  onChange={e => setAttachForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Display name (optional)"
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-sm btn-cta" disabled={attachSaving}>
                  {attachSaving ? 'Saving…' : 'Attach Email'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-cta btn-icon-cancel"
                  onClick={() => setAttachTarget(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
