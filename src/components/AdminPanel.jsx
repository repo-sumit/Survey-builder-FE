import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Create form state
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    role: 'state',
    stateCode: '',
    isActive: true
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    password: '',
    role: '',
    stateCode: '',
    isActive: true
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await adminAPI.getUsers();
      setUsers(data);
      setError(null);
    } catch (err) {
      setError('Failed to load users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);

    if (!createForm.username.trim() || !createForm.password.trim()) {
      setError('Username and password are required');
      return;
    }
    if (createForm.role === 'state' && !createForm.stateCode.trim()) {
      setError('State code is required for state users');
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
      const msg = err.response?.data?.error || 'Failed to create user';
      setError(msg);
    }
  };

  const startEdit = (user) => {
    setEditingUser(user.id);
    setEditForm({
      password: '',
      role: user.role,
      stateCode: user.stateCode || '',
      isActive: user.isActive
    });
  };

  const handleUpdate = async (userId) => {
    setError(null);

    const updates = {};
    if (editForm.password.trim()) updates.password = editForm.password;
    if (editForm.role) updates.role = editForm.role;
    if (editForm.role === 'state' && editForm.stateCode.trim()) {
      updates.stateCode = editForm.stateCode.trim();
    }
    updates.isActive = editForm.isActive;

    try {
      await adminAPI.updateUser(userId, updates);
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to update user';
      setError(msg);
    }
  };

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  return (
    <div className="admin-panel">
      <div className="list-header">
        <h2>User Management</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'Cancel' : '+ Create User'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Create User Form */}
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
                  onChange={(e) => setCreateForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Enter username"
                />
              </div>
              <div className="form-group">
                <label htmlFor="create-password">Password</label>
                <input
                  id="create-password"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
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
                  onChange={(e) => setCreateForm(prev => ({ ...prev, role: e.target.value }))}
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
                    onChange={(e) => setCreateForm(prev => ({ ...prev, stateCode: e.target.value }))}
                    placeholder="e.g., MH, KA, TN"
                  />
                </div>
              )}
              <div className="form-group">
                <label htmlFor="create-active">Status</label>
                <select
                  id="create-active"
                  value={createForm.isActive ? 'active' : 'inactive'}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))}
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

      {/* Users Table */}
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
                        onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
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
                          onChange={(e) => setEditForm(prev => ({ ...prev, stateCode: e.target.value }))}
                          placeholder="State code"
                          className="input-sm"
                        />
                      ) : (
                        <span className="text-muted">N/A</span>
                      )}
                    </td>
                    <td>
                      <select
                        value={editForm.isActive ? 'active' : 'inactive'}
                        onChange={(e) => setEditForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))}
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
                          onChange={(e) => setEditForm(prev => ({ ...prev, password: e.target.value }))}
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
    </div>
  );
};

export default AdminPanel;
