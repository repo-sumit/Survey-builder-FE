import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';

const LOGIN_SIDE_IMAGE = 'https://i.ibb.co/gbgGT6PZ/image-9.png';
const BRAND_LOGO_URL = 'https://i.ibb.co/Wv5BJFsZ/swiftchat.png';
const INVALID_CREDENTIALS_MESSAGE = 'Please enter correct ID and password.';

const EyeIcon = ({ crossed = false }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
    {crossed && <line x1="3" y1="21" x2="21" y2="3" />}
  </svg>
);

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
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
      setError(parseLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-shell">
        <section className="login-visual" aria-hidden="true">
          <img className="login-side-image" src={LOGIN_SIDE_IMAGE} alt="Survey analytics illustration" />
        </section>

        <section className="login-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <h1>FMB Survey Builder</h1>
            <img className="login-logo" src={BRAND_LOGO_URL} alt="SwiftChat logo" />
          </div>
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
              <div className="password-input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  disabled={loading}
                >
                  <EyeIcon crossed={showPassword} />
                </button>
              </div>
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
