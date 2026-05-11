import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseClient';
import { authAPI } from '../services/api';

const LOGIN_SIDE_IMAGE = 'https://i.ibb.co/gbgGT6PZ/image-9.png';
const BRAND_LOGO_URL = 'https://i.ibb.co/Wv5BJFsZ/swiftchat.png';

const GoogleIcon = () => (
  <svg viewBox="0 0 18 18" width="20" height="20" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.252-.164-1.84H9v3.48h4.844a4.14 4.14 0 0 1-1.797 2.717v2.258h2.908c1.702-1.567 2.685-3.873 2.685-6.615z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.836.858-3.048.858-2.343 0-4.328-1.582-5.036-3.71H.957v2.331A8.997 8.997 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.963H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.331z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963l3.007 2.331C4.672 5.166 6.657 3.58 9 3.58z"/>
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
  const { loginWithGoogle, session, user, loading, authError, isSupabaseConfigured } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    authAPI.warmup().catch(() => {});
  }, []);

  // Once Supabase resolves a session AND the backend resolves the local user,
  // redirect to the appropriate landing page.
  useEffect(() => {
    if (!loading && user) {
      navigate(user.role === 'admin' ? '/admin' : '/');
    }
  }, [user, loading, navigate]);

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    try {
      setSigningIn(true);
      await loginWithGoogle();
      // Supabase will redirect the page to Google. When it comes back, the
      // AuthContext picks up the session and loads /api/auth/me automatically.
    } catch (err) {
      setLocalError(err?.message || 'Could not start Google sign-in. Try again.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (_e) { /* ignore */ }
  };

  const errorMessage = localError || authError;
  const showSignOutHelper = session && authError; // signed into Google but blocked by backend

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
          <h2>Sign in with your Google account to continue</h2>

          {!isSupabaseConfigured && (
            <div className="error-message" style={{ marginBottom: '1.25rem' }}>
              Authentication is not configured. See <code>SUPABASE_SETUP.md</code>.
            </div>
          )}

          {errorMessage && (
            <div className="error-message" style={{ marginBottom: '1.25rem' }}>
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary btn-full btn-cta"
            style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem' }}
            disabled={signingIn || loading || !isSupabaseConfigured}
            onClick={handleGoogleSignIn}
          >
            <GoogleIcon />
            {signingIn ? 'Redirecting to Google…' : 'Continue with Google'}
          </button>

          {showSignOutHelper && (
            <button
              type="button"
              className="btn btn-secondary btn-full btn-cta"
              style={{ marginTop: '0.75rem' }}
              onClick={handleSignOut}
            >
              Sign out of Google
            </button>
          )}

          <p className="login-built-for">Built for ConveGenius</p>
        </section>
      </div>
    </div>
  );
};

export default Login;
