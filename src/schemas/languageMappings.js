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

// ISO 639-1 codes for LibreTranslate (null = not supported by LibreTranslate)
export const LANGUAGE_ISO_CODES = {
  'English': 'en',
  'Hindi': 'hi',
  'Bengali': 'bn',
  'Assamese': 'as',
  'Bodo': null,
  'Gujarati': 'gu',
  'Marathi': 'mr',
  'Tamil': 'ta',
  'Telugu': 'te',
  'Punjabi': 'pa'
};

export const getNativeScript = (englishName) => LANGUAGE_MAPPINGS[englishName] || englishName;
export const getISOCode = (englishName) => LANGUAGE_ISO_CODES[englishName] ?? null;
export const getAvailableLanguages = () => Object.keys(LANGUAGE_MAPPINGS);
export const isLanguageSupported = (language) => language in LANGUAGE_MAPPINGS;
