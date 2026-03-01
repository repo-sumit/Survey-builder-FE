/**
 * Shared validation constants for frontend
 * Should match server-side validation rules
 */

export const AVAILABLE_MEDIUMS = [
  'English', 'Hindi', 'Gujarati', 'Marathi', 'Tamil', 
  'Telugu', 'Bengali', 'Bodo', 'Punjabi', 'Assamese'
];

export const QUESTION_TYPES = [
  'Multiple Choice Single Select',
  'Multiple Choice Multi Select',
  'Tabular Text Input',
  'Tabular Drop Down',
  'Tabular Check Box',
  'Text Response',
  'Image Upload',
  'Video Upload',
  'Voice Response',
  'Likert Scale',
  'Calendar',
  'Drop Down'
];

export const TEXT_INPUT_TYPES = ['Numeric', 'Alphanumeric', 'Alphabets', 'None'];
export const QUESTION_MEDIA_TYPES = ['Image', 'Video', 'Audio', 'None'];
export const MODES = ['New Data', 'Correction', 'Delete Data', 'None'];
export const YES_NO_VALUES = ['Yes', 'No'];

// Validation patterns
export const PATTERNS = {
  SURVEY_ID: /^[A-Za-z0-9_]+$/,
  QUESTION_ID: /^Q\d+(\.\d+)*$/,
  DATE_FORMAT: /^\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2}:\d{2})?$/,
  YOUTUBE_URL: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/,
  TABLE_QUESTION_FORMAT: /^[a-z]:.+(\n[a-z]:.+)*$/
};

// Length constraints
export const CONSTRAINTS = {
  SURVEY_NAME_MAX: 99,
  SURVEY_DESCRIPTION_MAX: 256,
  QUESTION_DESCRIPTION_MAX: 1024,
  OPTION_MAX: 20,
  OPTION_CHAR_MAX: 100,
  HIERARCHY_LEVEL_MIN: 1,
  HIERARCHY_LEVEL_MAX: 100   // designation_id range 1-100; level 99 = auto-included Test
};

// Validation messages
export const MESSAGES = {
  REQUIRED: (field) => `${field} is required`,
  MAX_LENGTH: (field, max) => `${field} must not exceed ${max} characters`,
  PATTERN_MISMATCH: (field, pattern) => `${field} must match pattern: ${pattern}`,
  ENUM_MISMATCH: (field, values) => `${field} must be one of: ${values.join(', ')}`,
  DATE_INVALID: 'Date must be in DD/MM/YYYY HH:MM:SS or DD/MM/YYYY format',
  DATE_COMPARE: 'Close Date must be greater than or equal to Launch Date',
  GEO_FENCING_TAGGING: 'Geo Tagging must be "Yes" when Geo Fencing is "Yes"',
  HIERARCHY_DUPLICATE: 'Hierarchical Access Level must not contain duplicate values',
  HIERARCHY_NUMERIC: 'Hierarchical Access Level must contain only numeric values (1-100)'
};
