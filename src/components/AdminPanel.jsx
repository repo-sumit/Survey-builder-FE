import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminAPI, stateConfigAPI } from '../services/api';
import { useToast } from './Toast';
import PageHeader from './ui/PageHeader';
import Icon from './ui/Icon';

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
    // Use replace to avoid stacking history entries on every tab click.
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
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
    if (u.email && u.username) return <span className="fmb-ap-badge">Both</span>;
    if (u.email)               return <span className="fmb-ap-badge role-state">Google</span>;
    if (u.username)            return <span className="fmb-ap-badge">Legacy</span>;
    return <span style={{ color: 'var(--text-3, #6b6b73)' }}>—</span>;
  };

  /* ── Derived metrics ─────────────────────────────────────────── */
  const userMetrics = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.isActive).length;
    const admins = users.filter(u => u.role === 'admin').length;
    const stateUsers = users.filter(u => u.role === 'state').length;
    return { total, active, admins, stateUsers };
  }, [users]);

  const stateMetrics = useMemo(() => {
    const total = states.length;
    const langSet = new Set();
    states.forEach(s => parseLangs(s.available_languages).forEach(l => langSet.add(l)));
    return { total, languages: langSet.size };
  }, [states]);

  return (
    <div className="fmb-ap-page" data-testid="admin-page">
      <PageHeader
        eyebrow="ADMIN"
        title="Admin Panel"
        sub="Manage states, languages, and users for the FMB Survey Builder."
      />

      {/* Tabs */}
      <div className="fmb-ap-tablist" role="tablist" aria-label="Admin sections">
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'states'}
          aria-controls="admin-states-panel"
          id="admin-states-tab"
          className="fmb-ap-tab"
          onClick={() => switchTab('states')}
          tabIndex={activeTab === 'states' ? 0 : -1}
        >
          State Configuration
          {stateMetrics.total > 0 && <span className="fmb-ap-tab-count">{stateMetrics.total}</span>}
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'users'}
          aria-controls="admin-users-panel"
          id="admin-users-tab"
          className="fmb-ap-tab"
          onClick={() => switchTab('users')}
          tabIndex={activeTab === 'users' ? 0 : -1}
        >
          User Management
          {userMetrics.total > 0 && <span className="fmb-ap-tab-count">{userMetrics.total}</span>}
        </button>
      </div>

      {/* ══════════ STATE CONFIG TAB ══════════ */}
      {activeTab === 'states' && (
        <div
          className="fmb-ap-panel"
          role="tabpanel"
          id="admin-states-panel"
          aria-labelledby="admin-states-tab"
          data-testid="admin-states-panel"
        >
          {/* Summary metrics (only when data exists) */}
          {!statesLoading && states.length > 0 && (
            <section className="fmb-ap-section" aria-label="State configuration summary">
              <div className="fmb-ap-metrics">
                <div className="fmb-ap-metric brand">
                  <span className="fmb-ap-metric-label">States configured</span>
                  <span className="fmb-ap-metric-value">{stateMetrics.total}</span>
                </div>
                <div className="fmb-ap-metric accent">
                  <span className="fmb-ap-metric-label">Distinct languages</span>
                  <span className="fmb-ap-metric-value">{stateMetrics.languages}</span>
                </div>
              </div>
            </section>
          )}

          {/* Section: list + add button */}
          <section className="fmb-ap-section" aria-labelledby="admin-states-h">
            <header className="fmb-ap-section-head with-actions">
              <div>
                <h3 id="admin-states-h" className="fmb-ap-section-title">State / U.T. Configuration</h3>
                <p className="fmb-ap-section-sub">Each row defines a state's display name and the languages survey content can be authored in.</p>
              </div>
              <div className="fmb-ap-toolbar">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={openAddState}
                  data-testid="state-add"
                >
                  <Icon name="plus" /> Add State
                </button>
              </div>
            </header>

            {statesError && (
              <div className="fmb-ap-error-banner" role="alert" data-testid="states-error">
                <span className="fmb-ap-error-banner-msg">{statesError}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={loadStates}>Retry</button>
              </div>
            )}

            {showStateForm && (
              <div className="fmb-ap-section" style={{ background: 'var(--surface-2)' }} data-testid="state-form">
                <header className="fmb-ap-section-head">
                  <h3 className="fmb-ap-section-title">{editingState ? 'Edit state' : 'Add state'}</h3>
                  <p className="fmb-ap-section-sub">State code is permanent once created. Languages can be edited at any time.</p>
                </header>
                {stateFormError && (
                  <div className="fmb-ap-error-banner" role="alert" data-testid="state-form-error">
                    <span className="fmb-ap-error-banner-msg">{stateFormError}</span>
                  </div>
                )}
                <form onSubmit={handleSaveState} noValidate>
                  <div className="fmb-ap-form-grid">
                    <div className="fmb-ap-field">
                      <label htmlFor="state-code" className="fmb-ap-field-label">
                        State Code <span className="fmb-ap-required">*</span>
                      </label>
                      <input
                        id="state-code"
                        type="text"
                        value={stateForm.state_code}
                        onChange={e => setStateForm(p => ({ ...p, state_code: e.target.value }))}
                        placeholder="e.g., HP, MH"
                        maxLength={10}
                        disabled={!!editingState}
                        className="fmb-ap-field-input"
                      />
                    </div>
                    <div className="fmb-ap-field">
                      <label htmlFor="state-name" className="fmb-ap-field-label">
                        State / U.T. Name <span className="fmb-ap-required">*</span>
                      </label>
                      <input
                        id="state-name"
                        type="text"
                        value={stateForm.state_name}
                        onChange={e => setStateForm(p => ({ ...p, state_name: e.target.value }))}
                        placeholder="e.g., Himachal Pradesh"
                        className="fmb-ap-field-input"
                      />
                    </div>
                  </div>

                  <div className="fmb-ap-field" style={{ marginTop: 'var(--s-3)' }}>
                    <span className="fmb-ap-field-label">
                      Available languages <span className="fmb-ap-required">*</span>
                    </span>
                    <div className="fmb-ap-langs">
                      {LANG_OPTIONS.map(lang => (
                        <label key={lang} className="fmb-ap-lang-cell">
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
                      <div className="fmb-ap-langs-summary">
                        Selected: {stateForm.available_languages.join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="fmb-ap-form-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowStateForm(false)}
                      disabled={savingState}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={savingState}
                      aria-busy={savingState}
                      data-testid="state-form-save"
                    >
                      {savingState ? 'Saving…' : (editingState ? 'Update' : 'Create')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* List */}
            {statesLoading ? (
              <div data-testid="states-loading" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                {[0, 1, 2].map(i => <div key={i} className="fmb-ap-skel" style={{ height: 44 }} />)}
              </div>
            ) : states.length === 0 ? (
              <div className="fmb-ap-empty" data-testid="states-empty">
                <div className="fmb-ap-empty-title">No states configured yet</div>
                <p>Click <strong>+ Add State</strong> to start.</p>
              </div>
            ) : (
              <div className="fmb-ap-table-wrap">
                <table className="fmb-ap-table" data-testid="states-table">
                  <thead>
                    <tr>
                      <th scope="col">State Code</th>
                      <th scope="col">State / U.T. Name</th>
                      <th scope="col">Available Languages</th>
                      <th scope="col" style={{ width: 1, whiteSpace: 'nowrap' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {states.map(s => (
                      <tr key={s.state_code} data-testid="state-row">
                        <td><span className="fmb-ap-badge state-code">{s.state_code}</span></td>
                        <td style={{ fontWeight: 500 }}>{s.state_name}</td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {parseLangs(s.available_languages).map(l => (
                              <span key={l} className="fmb-ap-badge">{l}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="fmb-ap-row-actions">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditState(s)}>Edit</button>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteState(s.state_code)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ══════════ USER MANAGEMENT TAB ══════════ */}
      {activeTab === 'users' && (
        <div
          className="fmb-ap-panel"
          role="tabpanel"
          id="admin-users-panel"
          aria-labelledby="admin-users-tab"
          data-testid="admin-users-panel"
        >
          {/* Summary metrics */}
          {!usersLoading && users.length > 0 && (
            <section className="fmb-ap-section" aria-label="User management summary">
              <div className="fmb-ap-metrics">
                <div className="fmb-ap-metric brand">
                  <span className="fmb-ap-metric-label">Total users</span>
                  <span className="fmb-ap-metric-value">{userMetrics.total}</span>
                </div>
                <div className="fmb-ap-metric accent">
                  <span className="fmb-ap-metric-label">Active</span>
                  <span className="fmb-ap-metric-value">{userMetrics.active}</span>
                </div>
                <div className="fmb-ap-metric">
                  <span className="fmb-ap-metric-label">Admins</span>
                  <span className="fmb-ap-metric-value">{userMetrics.admins}</span>
                </div>
                <div className="fmb-ap-metric">
                  <span className="fmb-ap-metric-label">State users</span>
                  <span className="fmb-ap-metric-value">{userMetrics.stateUsers}</span>
                </div>
              </div>
            </section>
          )}

          <section className="fmb-ap-section" aria-labelledby="admin-users-h">
            <header className="fmb-ap-section-head with-actions">
              <div>
                <h3 id="admin-users-h" className="fmb-ap-section-title">User Management</h3>
                <p className="fmb-ap-section-sub">Invite users by email — they sign in with Google using that exact address.</p>
              </div>
              <div className="fmb-ap-toolbar">
                <button
                  type="button"
                  aria-expanded={showInviteForm}
                  aria-controls="add-user-form"
                  className="btn btn-primary btn-sm"
                  onClick={() => (showInviteForm ? closeInviteForm() : openInviteForm())}
                  data-testid="user-add"
                >
                  {showInviteForm ? 'Cancel' : (<><Icon name="plus" /> Add User</>)}
                </button>
                {SHOW_LEGACY_CREATE && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setShowLegacyCreate(v => !v); setShowInviteForm(false); }}
                    title="Create a username/password user (legacy path)"
                  >
                    {showLegacyCreate ? 'Hide legacy' : 'Legacy create'}
                  </button>
                )}
              </div>
            </header>

            {/* Load-level error — separate from submit error.
                Always offers a Retry button. */}
            {usersError && (
              <div className="fmb-ap-error-banner" role="alert">
                <span className="fmb-ap-error-banner-msg">{usersError}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={loadUsers}>Retry</button>
              </div>
            )}

            {showInviteForm && (
              <div className="fmb-ap-section" style={{ background: 'var(--surface-2)' }} id="add-user-form" data-testid="invite-form">
                <header className="fmb-ap-section-head">
                  <h3 className="fmb-ap-section-title">Add user</h3>
                  <p className="fmb-ap-section-sub">The user will sign in via Google with this exact email. No password is needed.</p>
                </header>
                {usersFormError && (
                  <div className="fmb-ap-error-banner" role="alert" data-testid="invite-form-error">
                    <span className="fmb-ap-error-banner-msg">{usersFormError}</span>
                  </div>
                )}
                <form onSubmit={handleAddUser} noValidate>
                  <div className="fmb-ap-form-grid">
                    <div className="fmb-ap-field">
                      <label htmlFor="invite-email" className="fmb-ap-field-label">
                        Email <span className="fmb-ap-required">*</span>
                      </label>
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
                        className="fmb-ap-field-input"
                      />
                      {inviteFieldErrors.email && (
                        <div id="invite-email-err" className="fmb-ap-field-error">
                          {inviteFieldErrors.email}
                        </div>
                      )}
                    </div>
                    <div className="fmb-ap-field">
                      <label htmlFor="invite-name" className="fmb-ap-field-label">Name</label>
                      <input
                        id="invite-name"
                        type="text"
                        autoComplete="name"
                        value={inviteForm.name}
                        onChange={e => setInviteForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Display name (optional)"
                        disabled={submittingInvite}
                        className="fmb-ap-field-input"
                      />
                    </div>
                    <div className="fmb-ap-field">
                      <label htmlFor="invite-role" className="fmb-ap-field-label">Role</label>
                      <select
                        id="invite-role"
                        value={inviteForm.role}
                        onChange={e => setInviteForm(p => ({ ...p, role: e.target.value, stateCode: e.target.value === 'admin' ? '' : p.stateCode }))}
                        disabled={submittingInvite}
                        className="fmb-ap-field-select"
                      >
                        <option value="state">State</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    {inviteForm.role === 'state' && (
                      <div className="fmb-ap-field">
                        <label htmlFor="invite-state" className="fmb-ap-field-label">
                          State <span className="fmb-ap-required">*</span>
                        </label>
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
                          className="fmb-ap-field-select"
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
                        {!statesLoading && states.length === 0 && (
                          <div className="fmb-ap-field-help">
                            {statesError
                              ? <>States failed to load. <button type="button" className="link" onClick={loadStates}>Retry</button></>
                              : 'No states configured. Add a state first, then come back.'}
                          </div>
                        )}
                        {inviteFieldErrors.stateCode && (
                          <div id="invite-state-err" className="fmb-ap-field-error">
                            {inviteFieldErrors.stateCode}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="fmb-ap-form-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={closeInviteForm}
                      disabled={submittingInvite}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={submittingInvite}
                      aria-busy={submittingInvite}
                      data-testid="invite-submit"
                    >
                      {submittingInvite ? 'Adding…' : 'Add User'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {SHOW_LEGACY_CREATE && showLegacyCreate && (
              <div className="fmb-ap-section" style={{ background: 'var(--surface-2)' }}>
                <header className="fmb-ap-section-head">
                  <h3 className="fmb-ap-section-title">Create legacy user (username + password)</h3>
                  <p className="fmb-ap-section-sub">Use only during the migration window. Prefer "Add User" for new accounts.</p>
                </header>
                <form onSubmit={handleLegacyCreate} noValidate>
                  <div className="fmb-ap-form-grid">
                    <div className="fmb-ap-field">
                      <label className="fmb-ap-field-label">Username</label>
                      <input
                        type="text"
                        value={legacyForm.username}
                        onChange={e => setLegacyForm(p => ({ ...p, username: e.target.value }))}
                        placeholder="Enter username"
                        className="fmb-ap-field-input"
                      />
                    </div>
                    <div className="fmb-ap-field">
                      <label className="fmb-ap-field-label">Password</label>
                      <input
                        type="password"
                        value={legacyForm.password}
                        onChange={e => setLegacyForm(p => ({ ...p, password: e.target.value }))}
                        placeholder="Enter password"
                        className="fmb-ap-field-input"
                      />
                    </div>
                    <div className="fmb-ap-field">
                      <label className="fmb-ap-field-label">Role</label>
                      <select
                        value={legacyForm.role}
                        onChange={e => setLegacyForm(p => ({ ...p, role: e.target.value }))}
                        className="fmb-ap-field-select"
                      >
                        <option value="state">State</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    {legacyForm.role === 'state' && (
                      <div className="fmb-ap-field">
                        <label className="fmb-ap-field-label">State</label>
                        <select
                          value={legacyForm.stateCode}
                          onChange={e => setLegacyForm(p => ({ ...p, stateCode: e.target.value }))}
                          className="fmb-ap-field-select"
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
                  <div className="fmb-ap-form-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowLegacyCreate(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm">Create</button>
                  </div>
                </form>
              </div>
            )}

            {/* Users list */}
            {usersLoading ? (
              <div data-testid="users-loading" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                {[0, 1, 2].map(i => <div key={i} className="fmb-ap-skel" style={{ height: 44 }} />)}
              </div>
            ) : users.length === 0 && !usersError ? (
              <div className="fmb-ap-empty" data-testid="users-empty">
                <div className="fmb-ap-empty-title">No users yet</div>
                <p>Click <strong>Add User</strong> to invite someone by email.</p>
              </div>
            ) : (
              <div className="fmb-ap-table-wrap">
                <table className="fmb-ap-table" data-testid="users-table">
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Identity</th>
                      <th scope="col">Auth</th>
                      <th scope="col">Role</th>
                      <th scope="col">State</th>
                      <th scope="col">Status</th>
                      <th scope="col">Invited / Last login</th>
                      <th scope="col" style={{ width: 1, whiteSpace: 'nowrap' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} data-testid="user-row">
                        {editingUser === u.id ? (
                          <>
                            <td style={{ color: 'var(--text-3, #6b6b73)' }}>{u.id}</td>
                            <td>
                              <div className="ident">
                                <span className="ident-primary">{u.email || u.username || '—'}</span>
                                <input
                                  type="text"
                                  className="fmb-ap-input-sm"
                                  value={editForm.name}
                                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                                  placeholder="Name"
                                />
                              </div>
                            </td>
                            <td>{authSourceBadge(u)}</td>
                            <td>
                              <select
                                value={editForm.role}
                                onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                                className="fmb-ap-input-sm"
                                style={{ minWidth: 90 }}
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
                                  className="fmb-ap-input-sm"
                                >
                                  <option value="">Select…</option>
                                  {states.map(s => (
                                    <option key={s.state_code} value={s.state_code}>{s.state_code}</option>
                                  ))}
                                </select>
                              ) : <span style={{ color: 'var(--text-3, #6b6b73)' }}>—</span>}
                            </td>
                            <td>
                              <select
                                value={editForm.isActive ? 'active' : 'inactive'}
                                onChange={e => setEditForm(p => ({ ...p, isActive: e.target.value === 'active' }))}
                                className="fmb-ap-input-sm"
                              >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </td>
                            <td style={{ color: 'var(--text-3, #6b6b73)', fontSize: 11.5 }}>
                              <div>Inv: {fmtDate(u.invitedAt)}</div>
                              <div>Last: {fmtDate(u.lastLoginAt)}</div>
                            </td>
                            <td>
                              <div className="fmb-ap-edit-cell">
                                {u.username && (
                                  <input
                                    type="password"
                                    className="fmb-ap-input-sm"
                                    style={{ width: 140 }}
                                    value={editForm.password}
                                    onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                                    placeholder="New password (opt.)"
                                  />
                                )}
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleUpdate(u.id)}>Save</button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingUser(null)}>Cancel</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ color: 'var(--text-3, #6b6b73)' }}>{u.id}</td>
                            <td>
                              <div className="ident">
                                <span className="ident-primary">{u.email || u.username || '—'}</span>
                                {u.name && <span className="ident-sub">{u.name}</span>}
                              </div>
                            </td>
                            <td>{authSourceBadge(u)}</td>
                            <td>
                              <span className={`fmb-ap-badge ${u.role === 'admin' ? 'role-admin' : 'role-state'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td>{u.stateCode || <span style={{ color: 'var(--text-3, #6b6b73)' }}>—</span>}</td>
                            <td>
                              <span className={`fmb-ap-badge ${u.isActive ? 'active' : 'inactive'}`}>
                                {u.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td style={{ color: 'var(--text-3, #6b6b73)', fontSize: 11.5 }}>
                              <div>Inv: {fmtDate(u.invitedAt)}</div>
                              <div>Last: {fmtDate(u.lastLoginAt)}</div>
                            </td>
                            <td>
                              <div className="fmb-ap-row-actions">
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(u)}>Edit</button>
                                {!u.email && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
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
          </section>
        </div>
      )}

      {/* ══════════ ATTACH EMAIL MODAL ══════════ */}
      {attachTarget && (
        <div
          className="fmb-ap-modal-backdrop"
          onClick={() => setAttachTarget(null)}
          role="presentation"
        >
          <div
            className="fmb-ap-modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attach-modal-title"
          >
            <h3 id="attach-modal-title" className="fmb-ap-modal-title">
              Convert "{attachTarget.username || `#${attachTarget.id}`}" to Google sign-in
            </h3>
            <p className="fmb-ap-section-sub">
              Attaching an email lets this user sign in with Google. The username/password
              login keeps working until you set <code>LEGACY_LOGIN_ENABLED=false</code>.
            </p>
            {attachError && (
              <div className="fmb-ap-error-banner" role="alert">
                <span className="fmb-ap-error-banner-msg">{attachError}</span>
              </div>
            )}
            <form onSubmit={handleAttach} noValidate>
              <div className="fmb-ap-form-grid">
                <div className="fmb-ap-field">
                  <label htmlFor="attach-email" className="fmb-ap-field-label">
                    Email <span className="fmb-ap-required">*</span>
                  </label>
                  <input
                    id="attach-email"
                    type="email"
                    value={attachForm.email}
                    onChange={e => setAttachForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="user@example.com"
                    autoFocus
                    className="fmb-ap-field-input"
                  />
                </div>
                <div className="fmb-ap-field">
                  <label htmlFor="attach-name" className="fmb-ap-field-label">Name</label>
                  <input
                    id="attach-name"
                    type="text"
                    value={attachForm.name}
                    onChange={e => setAttachForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Display name (optional)"
                    className="fmb-ap-field-input"
                  />
                </div>
              </div>
              <div className="fmb-ap-form-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setAttachTarget(null)}
                  disabled={attachSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={attachSaving}
                  aria-busy={attachSaving}
                >
                  {attachSaving ? 'Saving…' : 'Attach Email'}
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
