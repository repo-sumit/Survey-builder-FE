import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';

const BRAND_LOGO_URL = 'https://i.ibb.co/Wv5BJFsZ/swiftchat.png';
const INVALID_CREDENTIALS_MESSAGE = 'Please enter correct ID and password.';

const parseLoginErrorMessage = (err) => {
  const statusCode = err?.response?.status;
  const responseError = err?.response?.data?.error;
  const responseMessage = err?.response?.data?.message;
  const apiMessage = typeof responseError === 'string'
    ? responseError
    : typeof responseError?.message === 'string'
      ? responseError.message
      : typeof responseMessage === 'string'
        ? responseMessage
        : '';

  if (statusCode === 401) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  if (/invalid (username|id) or password/i.test(apiMessage)) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  const timeout = err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '');
  if (timeout) {
    return 'Unable to sign in right now. Please try again.';
  }

  if (apiMessage) {
    return apiMessage;
  }

  return 'Login failed. Please try again.';
};

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    authAPI.warmup().catch(() => {});
  }, []);

  const analyticsBars = useMemo(() => [32, 48, 22, 44, 57, 28, 62, 35, 50], []);

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
      setError(parseLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-shell">
        <section className="login-visual" aria-hidden="true">
          <div className="login-visual-head">
            <img className="login-logo" src={BRAND_LOGO_URL} alt="SwiftChat logo" />
            <div className="login-visual-brand-copy">
              <p className="login-visual-brand">SwiftChat</p>
              <p className="login-visual-sub">Business Manager</p>
            </div>
          </div>

          <div className="login-analytics-card">
            <div className="login-analytics-header">
              <span className="analytics-dot" />
              <span className="analytics-dot" />
              <span className="analytics-dot" />
            </div>

            <div className="login-analytics-curve" />

            <div className="login-analytics-footer">
              <div className="login-analytics-donut" />
              <div className="login-analytics-bars" role="presentation">
                {analyticsBars.map((height, index) => (
                  <span key={`${height}-${index}`} style={{ '--bar-height': `${height}px` }} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="login-card">
          <h1>Log in to SwiftChat Survey Builder</h1>
          <h2>Enter your credentials to continue</h2>

          {error && <div className="error-message" style={{ marginBottom: '1.25rem' }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">User ID</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your user ID"
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
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-cta btn-icon-signin"
              style={{ marginTop: '1.5rem' }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Log in'}
            </button>
          </form>

          <p className="login-built-for">Built for ConveGenius</p>
        </section>
      </div>
    </div>
  );
};

export default Login;
