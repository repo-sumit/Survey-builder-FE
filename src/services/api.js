import axios from 'axios';

// Use environment variable for API URL, fallback to hardcoded for dev
// In production (React build), set REACT_APP_API_URL in your hosting environment
// Example: REACT_APP_API_URL=https://survey-builder-be.onrender.com/api
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://survey-builder-be.onrender.com/api';

// Survey API calls
export const surveyAPI = {
  // Get all surveys
  getAll: async () => {
    const response = await axios.get(`${API_BASE_URL}/surveys`);
    return response.data;
  },

  // Get survey by ID
  getById: async (surveyId) => {
    const response = await axios.get(`${API_BASE_URL}/surveys/${surveyId}`);
    return response.data;
  },

  // Create new survey
  create: async (surveyData) => {
    const response = await axios.post(`${API_BASE_URL}/surveys`, surveyData);
    return response.data;
  },

  // Update survey
  update: async (surveyId, surveyData) => {
    const response = await axios.put(`${API_BASE_URL}/surveys/${surveyId}`, surveyData);
    return response.data;
  },

  // Delete survey
  delete: async (surveyId) => {
    const response = await axios.delete(`${API_BASE_URL}/surveys/${surveyId}`);
    return response.data;
  },

  // Duplicate survey
  duplicate: async (surveyId, newSurveyId) => {
    const response = await axios.post(`${API_BASE_URL}/surveys/${surveyId}/duplicate`, { newSurveyId });
    return response.data;
  }
};

// Question API calls
export const questionAPI = {
  // Get all questions for a survey
  getAll: async (surveyId) => {
    const response = await axios.get(`${API_BASE_URL}/surveys/${surveyId}/questions`);
    return response.data;
  },

  // Create new question
  create: async (surveyId, questionData) => {
    const response = await axios.post(`${API_BASE_URL}/surveys/${surveyId}/questions`, questionData);
    return response.data;
  },

  // Update question
  update: async (surveyId, questionId, questionData) => {
    const response = await axios.put(`${API_BASE_URL}/surveys/${surveyId}/questions/${questionId}`, questionData);
    return response.data;
  },

  // Delete question
  delete: async (surveyId, questionId) => {
    const response = await axios.delete(`${API_BASE_URL}/surveys/${surveyId}/questions/${questionId}`);
    return response.data;
  },

  // Duplicate question
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

// Export API call
export const exportAPI = {
  // Download Excel for survey
  download: async (surveyId) => {
    const response = await axios.get(`${API_BASE_URL}/export/${surveyId}`, {
      responseType: 'blob'
    });
    
    let url = '';
    const link = document.createElement('a');
    try {
      // Create download link
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

// Import API call
export const importAPI = {
  // Import survey from XLSX/CSV file
  importFile: async (file, overwrite = false) => {
    const formData = new FormData();
    formData.append('file', file);

    const url = overwrite
      ? `${API_BASE_URL}/import?overwrite=true`
      : `${API_BASE_URL}/import`;

    const response = await axios.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }
};

// Validation API calls
export const validationAPI = {
  // Validate uploaded file
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

  // Get validation schema
  getSchema: async () => {
    const response = await axios.get(`${API_BASE_URL}/validation-schema`);
    return response.data;
  }
};

// Translation API calls
export const translateAPI = {
  translate: async (text, target, source = 'en') => {
    const response = await axios.post(`${API_BASE_URL}/translate`, { text, target, source });
    return response.data;
  }
};
