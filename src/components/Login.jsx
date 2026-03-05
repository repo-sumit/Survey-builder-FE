import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  useEffect(() => {
    // Warm up backend while the user is on the login screen (helps cold starts).
    authAPI.warmup().catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }
    try {
      setLoading(true);
      await login(username, password);
      navigate('/');
    } catch (err) {
      const timeout = err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '');
      if (timeout) {
        setError('Login timed out. The server may be waking up. Please retry in a few seconds.');
        return;
      }

      const apiError = err.response?.data?.error;
      if (typeof apiError === 'string') {
        setError(apiError);
      } else if (apiError && typeof apiError === 'object' && typeof apiError.message === 'string') {
        setError(apiError.message);
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">F</div>
        <h1>FMB Survey Builder</h1>
        <h2>Sign in to continue</h2>

        {error && <div className="error-message" style={{ marginBottom: '1.25rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            style={{ marginTop: '1.5rem' }}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
