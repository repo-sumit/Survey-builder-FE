import React, { useEffect, useState } from 'react';
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
      setError(parseLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Floating orbs for depth and ambience */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className="login-card">
        <div className="login-card-glow" />
        <img className="login-logo" src={BRAND_LOGO_URL} alt="SwiftChat logo" />
        <h1>FMB Survey Builder</h1>
        <h2>Sign in to continue</h2>
        <p className="login-built-for">Built for ConveGenius</p>

        {error && <div className="error-message" style={{ marginBottom: '1.25rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
