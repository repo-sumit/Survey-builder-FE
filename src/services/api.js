import axios from 'axios';
import { supabase, getAccessToken, signOutSupabase, signInWithGoogle, isSupabaseConfigured } from './supabaseClient';
import { isPublicApiPath } from './publicApiPaths';
import { createOn401Refresh } from './authResponseInterceptor';

const API_BASE_URL = '/api';
const AUTH_WARMUP_TIMEOUT_MS = 15000;

// Default timeout for all requests (30s)
axios.defaults.timeout = 30000;

// --- Axios interceptors ---

// Request: attach Supabase access token (Google sign-in is the only auth path).
// LEGACY LOGIN — localStorage 'token' fallback disabled.
axios.interceptors.request.use(async (config) => {
  // Public endpoints skip token retrieval entirely — see PUBLIC_API_PATHS.
  if (isPublicApiPath(config.url)) {
    return config;
  }
  let token = null;
  if (isSupabaseConfigured) {
    try { token = await getAccessToken(); } catch { /* ignore */ }
  }
  // LEGACY LOGIN — fallback to localStorage 'token' disabled.
  // if (!token) {
  //   token = localStorage.getItem('token');
  // }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Refresh-on-401 policy. Implemented in `authResponseInterceptor.js` and
 * injected with the live deps below. See that file for the full rules.
 * Tests for the policy live next to that module and don't import axios.
 */
const on401Refresh = createOn401Refresh({
  isPublicApiPath,
  refreshSession: async () => {
    if (!supabase || !isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) return null;
      return (data && data.session) || null;
    } catch {
      return null;
    }
  },
  signOut: signOutSupabase,
  redirectToLogin: () => {
    if (typeof window !== 'undefined' && window.location && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  },
  request: (config) => axios(config)
});

/**
 * Auth-healthy signal.
 *
 * The reconnect banner appears when /api/auth/me fails transiently. It is
 * cleared on (a) a successful /me revalidation, (b) the user clicking
 * Retry or Dismiss, or (c) a TOKEN_REFRESHED event. None of those fire
 * automatically when the user simply keeps using the app and ALL OTHER
 * authenticated API calls succeed — so the banner can stay stuck even
 * after the backend is clearly healthy (every admin/survey/admin call is
 * returning 200).
 *
 * This interceptor fixes that: every successful 2xx response from a
 * NON-PUBLIC endpoint is proof that:
 *   - the BE is reachable,
 *   - the JWT was verified (same code path that /me uses), and
 *   - the user's session is still valid.
 *
 * That's a strong enough signal to clear the reconnect banner without
 * waiting for another explicit /me round-trip. We dispatch a window-level
 * CustomEvent so AuthContext can react without coupling the API layer to
 * React state. The handler in AuthContext is a no-op when authWarning is
 * already null, so the dispatch is essentially free on the happy path.
 *
 * Safety properties:
 *   - We do NOT bypass /api/auth/me as authorization — every protected
 *     route still verifies the JWT server-side.
 *   - We do NOT change the response payload or any error handling.
 *   - 401 / 403 / 5xx still flow through `on401Refresh` unchanged.
 *   - Public probes (/api/health, /api/ready, /api/keep-alive) do NOT
 *     emit the signal — a 200 there does not confirm auth.
 */
function dispatchAuthHealthy() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent('fmb:auth-healthy'));
  } catch {
    /* CustomEvent unavailable (very old browsers / jsdom edge) — silently skip. */
  }
}

axios.interceptors.response.use((response) => {
  const url = response && response.config && response.config.url;
  if (url && !isPublicApiPath(url) && response.status >= 200 && response.status < 300) {
    dispatchAuthHealthy();
  }
  return response;
}, on401Refresh);

// --- Auth API ---

export const authAPI = {
  // LEGACY LOGIN — disabled. Backend returns 410 Gone. Kept for reference.
  // login: async (username, password) => {
  //   const response = await axios.post(
  //     `${API_BASE_URL}/auth/login`,
  //     { username, password },
  //     { timeout: AUTH_LOGIN_TIMEOUT_MS }
  //   );
  //   return response.data;
  // },
  loginWithGoogle: async (redirectTo) => {
    return signInWithGoogle(redirectTo);
  },
  me: async () => {
    const response = await axios.get(`${API_BASE_URL}/auth/me`);
    return response.data.user;
  },
  warmup: async () => {
    await axios.get(`${API_BASE_URL}/health`, {
      timeout: AUTH_WARMUP_TIMEOUT_MS,
      // No auth required and this endpoint is cache-safe to bypass.
      headers: { 'Cache-Control': 'no-cache' }
    });
    return true;
  }
};

// --- Admin API ---

export const adminAPI = {
  getUsers: async () => {
    const response = await axios.get(`${API_BASE_URL}/admin/users`);
    return response.data;
  },
  // createUser accepts either { email, name, role, stateCode } (invite)
  // or { username, password, role, stateCode } (legacy) — see Survey-builder-BE/routes/admin.js.
  createUser: async (userData) => {
    const response = await axios.post(`${API_BASE_URL}/admin/users`, userData);
    return response.data;
  },
  updateUser: async (id, userData) => {
    const response = await axios.patch(`${API_BASE_URL}/admin/users/${id}`, userData);
    return response.data;
  },
  attachEmail: async (id, { email, name }) => {
    const response = await axios.post(`${API_BASE_URL}/admin/users/${id}/attach-email`, { email, name });
    return response.data;
  }
};

// --- State Config API ---

export const stateConfigAPI = {
  getAll: async () => {
    const response = await axios.get(`${API_BASE_URL}/admin/state-config`);
    return response.data;
  },
  upsert: async (data) => {
    const response = await axios.post(`${API_BASE_URL}/admin/state-config`, data);
    return response.data;
  },
  update: async (stateCode, data) => {
    const response = await axios.patch(`${API_BASE_URL}/admin/state-config/${stateCode}`, data);
    return response.data;
  },
  delete: async (stateCode) => {
    const response = await axios.delete(`${API_BASE_URL}/admin/state-config/${stateCode}`);
    return response.data;
  }
};

// --- Lock API ---

export const lockAPI = {
  acquire: async (surveyId) => {
    const response = await axios.post(`${API_BASE_URL}/surveys/${surveyId}/lock`);
    return response.data;
  },
  release: async (surveyId) => {
    const response = await axios.delete(`${API_BASE_URL}/surveys/${surveyId}/lock`);
    return response.data;
  },
  status: async (surveyId) => {
    const response = await axios.get(`${API_BASE_URL}/surveys/${surveyId}/lock`);
    return response.data;
  }
};

// --- Publish API ---

export const publishAPI = {
  publish: async (surveyId) => {
    const response = await axios.post(`${API_BASE_URL}/surveys/${surveyId}/publish`);
    return response.data;
  },
  unpublish: async (surveyId) => {
    const response = await axios.post(`${API_BASE_URL}/surveys/${surveyId}/unpublish`);
    return response.data;
  }
};

// --- Survey API calls ---

export const surveyAPI = {
  getAll: async () => {
    const response = await axios.get(`${API_BASE_URL}/surveys`);
    return response.data;
  },
  getById: async (surveyId) => {
    const response = await axios.get(`${API_BASE_URL}/surveys/${surveyId}`);
    return response.data;
  },
  create: async (surveyData) => {
    const response = await axios.post(`${API_BASE_URL}/surveys`, surveyData);
    return response.data;
  },
  update: async (surveyId, surveyData) => {
    const response = await axios.put(`${API_BASE_URL}/surveys/${surveyId}`, surveyData);
    return response.data;
  },
  delete: async (surveyId) => {
    const response = await axios.delete(`${API_BASE_URL}/surveys/${surveyId}`);
    return response.data;
  },
  duplicate: async (surveyId, newSurveyId) => {
    const response = await axios.post(`${API_BASE_URL}/surveys/${surveyId}/duplicate`, { newSurveyId });
    return response.data;
  }
};

// --- Question API calls ---

export const questionAPI = {
  getAll: async (surveyId) => {
    const response = await axios.get(`${API_BASE_URL}/surveys/${surveyId}/questions`);
    return response.data;
  },
  create: async (surveyId, questionData) => {
    const response = await axios.post(`${API_BASE_URL}/surveys/${surveyId}/questions`, questionData);
    return response.data;
  },
  update: async (surveyId, questionId, questionData) => {
    const response = await axios.put(`${API_BASE_URL}/surveys/${surveyId}/questions/${questionId}`, questionData);
    return response.data;
  },
  delete: async (surveyId, questionId) => {
    const response = await axios.delete(`${API_BASE_URL}/surveys/${surveyId}/questions/${questionId}`);
    return response.data;
  },
  duplicate: async (surveyId, questionId, newQuestionId) => {
    const payload = {};
    if (newQuestionId) {
      payload.newQuestionId = newQuestionId;
    }
    const response = await axios.post(
      `${API_BASE_URL}/surveys/${surveyId}/questions/${questionId}/duplicate`,
      payload
    );
    return response.data;
  }
};

// --- Export API call ---

export const exportAPI = {
  download: async (surveyId) => {
    const response = await axios.get(`${API_BASE_URL}/export/${surveyId}`, {
      responseType: 'blob'
    });

    let url = '';
    const link = document.createElement('a');
    try {
      url = window.URL.createObjectURL(new Blob([response.data]));
      link.href = url;
      link.setAttribute('download', `${surveyId}_dump.xlsx`);
      document.body.appendChild(link);
      link.click();
    } finally {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      if (url) {
        window.URL.revokeObjectURL(url);
      }
    }

    return true;
  }
};

// --- Designation Mapping API ---

export const designationAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams();
    if (params.stateCode) q.set('stateCode', params.stateCode);
    if (params.medium)    q.set('medium',    params.medium);
    const qs = q.toString() ? `?${q}` : '';
    const response = await axios.get(`${API_BASE_URL}/designations${qs}`);
    return response.data;
  },
  create: async (data) => {
    const response = await axios.post(`${API_BASE_URL}/designations`, data);
    return response.data;
  },
  update: async (id, data) => {
    // id is the serial PK from the designation_hierarchy table
    const response = await axios.patch(`${API_BASE_URL}/designations/${id}`, data);
    return response.data;
  },
  delete: async (id, stateCode) => {
    const q = stateCode ? `?stateCode=${stateCode}` : '';
    const response = await axios.delete(`${API_BASE_URL}/designations/${id}${q}`);
    return response.data;
  },
  seedDefaults: async (stateCode) => {
    const response = await axios.post(`${API_BASE_URL}/designations/seed-defaults`, { stateCode });
    return response.data;
  },
  exportXlsx: async (stateCode) => {
    const q = stateCode ? `?stateCode=${stateCode}` : '';
    const response = await axios.get(`${API_BASE_URL}/designations/export${q}`, {
      responseType: 'blob'
    });
    const disposition = response.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const fileName = match ? match[1] : `designation_mapping.xlsx`;
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return true;
  }
};

// --- Access Sheet API ---

export const accessSheetAPI = {
  dump: async (stateCode) => {
    const response = await axios.post(`${API_BASE_URL}/access-sheet/dump`, stateCode ? { stateCode } : {});
    return response.data;
  },
  getLatest: async (stateCode) => {
    const qs = stateCode ? `?stateCode=${stateCode}` : '';
    const response = await axios.get(`${API_BASE_URL}/access-sheet/latest${qs}`);
    return response.data;
  },
  download: async (stateCode) => {
    const qs = stateCode ? `?stateCode=${stateCode}` : '';
    const response = await axios.get(`${API_BASE_URL}/access-sheet/latest/download${qs}`, {
      responseType: 'blob'
    });
    const disposition = response.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const fileName = match ? match[1] : `access_sheet_${stateCode || 'state'}.xlsx`;
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return true;
  }
};

// --- Translate API ---

export const translateAPI = {
  translate: async (text, targetLangCode) => {
    const response = await axios.post(`${API_BASE_URL}/translate`, {
      text,
      source: 'en',
      target: targetLangCode
    });
    return response.data.translatedText || '';
  }
};

// --- Validation API calls ---

export const validationAPI = {
  validateUpload: async (file, schema) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(
      `${API_BASE_URL}/validate-upload?schema=${schema}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },
  getSchema: async () => {
    const response = await axios.get(`${API_BASE_URL}/validation-schema`);
    return response.data;
  }
};
