import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';

const LOGIN_SIDE_IMAGE = 'https://i.ibb.co/gbgGT6PZ/image-9.png';
const BRAND_LOGO_URL = 'https://i.ibb.co/Wv5BJFsZ/swiftchat.png';
const INVALID_CREDENTIALS_MESSAGE = 'Please enter correct ID and password.';

const LEGACY_LOGIN_VISIBLE = (process.env.REACT_APP_LEGACY_LOGIN_VISIBLE || 'true').toLowerCase() !== 'false';

const REASON_MESSAGES = {
  NOT_INVITED: 'Your Google account is not invited. Ask an admin to invite you by email.',
  INACTIVE: 'Your account is inactive. Contact an admin to reactivate it.',
  DOMAIN_BLOCKED: 'This email domain is not allowed. Use an approved corporate email.'
};

const EyeIcon = ({ crossed = false }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
    {crossed && <line x1="3" y1="21" x2="21" y2="3" />}
  </svg>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.3l-6.3-5.2C29.3 35 26.8 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.2C41.4 35.2 44 30 44 24c0-1.2-.1-2.4-.4-3.5z"/>
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

  if (statusCode === 410) {
    return 'Username/password login is disabled. Sign in with Google.';
  }
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
  if (apiMessage) return apiMessage;
  return 'Login failed. Please try again.';
};

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { loginLegacy, loginWithGoogle, isSupabaseConfigured, authReason, clearAuthReason } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    authAPI.warmup().catch(() => {});
  }, []);

  const handleGoogle = async () => {
    setError(null);
    clearAuthReason();
    try {
      setGoogleLoading(true);
      await loginWithGoogle();
      // The browser redirects through Supabase → Google → back to this app;
      // when it returns, AuthContext.onAuthStateChange triggers /me + setUser.
    } catch (err) {
      setError(err?.message || 'Google sign-in failed.');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    clearAuthReason();

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }

    try {
      setLoading(true);
      await loginLegacy(username, password);
      navigate('/');
    } catch (err) {
      setError(parseLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const reasonBanner = authReason ? REASON_MESSAGES[authReason] : null;

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
          <h2>Sign in to continue</h2>

          {reasonBanner && (
            <div className="error-message" style={{ marginBottom: '1rem' }}>{reasonBanner}</div>
          )}
          {error && <div className="error-message" style={{ marginBottom: '1.25rem' }}>{error}</div>}

          {isSupabaseConfigured ? (
            <button
              type="button"
              className="btn btn-primary btn-full btn-cta"
              style={{ marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}
              onClick={handleGoogle}
              disabled={googleLoading}
            >
              <GoogleIcon />
              {googleLoading ? 'Redirecting to Google…' : 'Continue with Google'}
            </button>
          ) : (
            <div className="error-message" style={{ marginBottom: '1rem' }}>
              Google sign-in is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.
            </div>
          )}

          {LEGACY_LOGIN_VISIBLE && (
            <>
              <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem', margin: '0.5rem 0 0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setLegacyOpen(v => !v)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {legacyOpen ? 'Hide legacy login' : 'Sign in with username and password'}
                </button>
              </div>

              {legacyOpen && (
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
                    className="btn btn-secondary btn-full btn-cta"
                    style={{ marginTop: '1rem' }}
                    disabled={loading}
                  >
                    {loading ? 'Signing in…' : 'Log in (legacy)'}
                  </button>
                </form>
              )}
            </>
          )}

          <p className="login-built-for">Built for ConveGenius</p>
        </section>
      </div>
    </div>
  );
};

export default Login;
