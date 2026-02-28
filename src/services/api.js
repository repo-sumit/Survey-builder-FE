import axios from 'axios';

const API_BASE_URL = '/api';

// --- Axios interceptors ---

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// --- Auth API ---

export const authAPI = {
  login: async (username, password) => {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, { username, password });
    return response.data;
  }
};

// --- Admin API ---

export const adminAPI = {
  getUsers: async () => {
    const response = await axios.get(`${API_BASE_URL}/admin/users`);
    return response.data;
  },
  createUser: async (userData) => {
    const response = await axios.post(`${API_BASE_URL}/admin/users`, userData);
    return response.data;
  },
  updateUser: async (id, userData) => {
    const response = await axios.patch(`${API_BASE_URL}/admin/users/${id}`, userData);
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
