// Language mapping between English names and native scripts
export const LANGUAGE_MAPPINGS = {
  'English': 'English',
  'Hindi': 'हिन्दी',
  'Bengali': 'বাংলা',
  'Assamese': 'অসমীয়া',
  'Bodo': 'बड़ो',
  'Gujarati': 'ગુજરાતી',
  'Marathi': 'मराठी',
  'Tamil': 'தமிழ்',
  'Telugu': 'తెలుగు',
  'Punjabi': 'ਪੰਜਾਬੀ'
};

// Get native script for a language
export const getNativeScript = (englishName) => {
  return LANGUAGE_MAPPINGS[englishName] || englishName;
};

// Get all available languages
export const getAvailableLanguages = () => {
  return Object.keys(LANGUAGE_MAPPINGS);
};

// Check if a language is supported
export const isLanguageSupported = (language) => {
  return language in LANGUAGE_MAPPINGS;
};
