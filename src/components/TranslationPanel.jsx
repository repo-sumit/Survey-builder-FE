import React, { useState } from 'react';
import { getNativeScript } from '../schemas/languageMappings';

const LANGUAGE_CODE_MAP = {
  English: 'en',
  Hindi: 'hi',
  Bengali: 'bn',
  Assamese: 'as',
  Gujarati: 'gu',
  Marathi: 'mr',
  Tamil: 'ta',
  Telugu: 'te',
  Punjabi: 'pa'
};

const TranslationPanel = ({ 
  languages, 
  translations, 
  onChange, 
  questionType,
  fieldConfig 
}) => {
  const [translating, setTranslating] = useState(false);
  const orderedLanguages = languages.includes('English')
    ? ['English', ...languages.filter(lang => lang !== 'English')]
    : languages;
  const primaryLanguage = orderedLanguages[0] || 'English';

  const getTranslation = (language) => translations[language] || {
    questionDescription: '',
    options: [],
    tableHeaderValue: '',
    tableQuestionValue: ''
  };

  const handleTranslationChange = (language, field, value) => {
    const updatedTranslations = {
      ...translations,
      [language]: {
        ...getTranslation(language),
        [field]: value
      }
    };
    onChange(updatedTranslations);
  };

  const ensureOptionArray = (options, index) => {
    const next = [...options];
    while (next.length <= index) {
      next.push({ text: '', textInEnglish: '', children: '' });
    }
    return next;
  };

  const handleEnglishOptionChange = (index, value) => {
    const updatedTranslations = {};
    orderedLanguages.forEach(lang => {
      const translation = { ...getTranslation(lang) };
      const options = ensureOptionArray(translation.options || [], index);
      const current = options[index] || { text: '', textInEnglish: '', children: '' };
      if (lang === primaryLanguage) {
        options[index] = { ...current, text: value, textInEnglish: value };
      } else {
        options[index] = { ...current, textInEnglish: value };
      }
      translation.options = options;
      updatedTranslations[lang] = translation;
    });

    onChange({
      ...translations,
      ...updatedTranslations
    });
  };

  const handleOptionTextChange = (language, index, value) => {
    const translation = { ...getTranslation(language) };
    const options = ensureOptionArray(translation.options || [], index);
    const current = options[index] || { text: '', textInEnglish: '', children: '' };
    options[index] = { ...current, text: value };
    translation.options = options;

    onChange({
      ...translations,
      [language]: translation
    });
  };

  const handleOptionChildrenChange = (index, value) => {
    const updatedTranslations = {};
    orderedLanguages.forEach(lang => {
      const translation = { ...getTranslation(lang) };
      const options = ensureOptionArray(translation.options || [], index);
      const current = options[index] || { text: '', textInEnglish: '', children: '' };
      options[index] = { ...current, children: value };
      translation.options = options;
      updatedTranslations[lang] = translation;
    });

    onChange({
      ...translations,
      ...updatedTranslations
    });
  };

  const addOption = () => {
    const maxOptions = fieldConfig?.maxOptions || 20;
    const currentCount = getOptionCount();

    if (currentCount >= maxOptions) {
      alert(`Maximum ${maxOptions} options allowed`);
      return;
    }

    const updatedTranslations = {};
    orderedLanguages.forEach(lang => {
      const translation = { ...getTranslation(lang) };
      translation.options = [
        ...(translation.options || []),
        { text: '', textInEnglish: '', children: '' }
      ];
      updatedTranslations[lang] = translation;
    });

    onChange({
      ...translations,
      ...updatedTranslations
    });
  };

  const removeOption = (index) => {
    const updatedTranslations = {};
    orderedLanguages.forEach(lang => {
      const translation = { ...getTranslation(lang) };
      const options = translation.options || [];
      translation.options = options.filter((_, i) => i !== index);
      updatedTranslations[lang] = translation;
    });

    onChange({
      ...translations,
      ...updatedTranslations
    });
  };

  const getOptionCount = () => {
    return Math.max(
      ...orderedLanguages.map(lang => (getTranslation(lang).options || []).length),
      0
    );
  };

  const splitHeaderValue = (value) => {
    if (!value) return ['', ''];
    const parts = value.split(',').map(part => part.trim());
    return [parts[0] || '', parts[1] || ''];
  };

  const buildHeaderValue = (parts) => {
    const [first, second] = parts;
    if (!first && !second) return '';
    return `${first || ''},${second || ''}`;
  };

  const updateHeaderValue = (language, index, value) => {
    const current = getTranslation(language);
    const parts = splitHeaderValue(current.tableHeaderValue);
    parts[index] = value;
    handleTranslationChange(language, 'tableHeaderValue', buildHeaderValue(parts));
  };

  const parseTableQuestions = (value) => {
    if (!value) return [''];
    const rows = value.split('\n').map(line => {
      const parts = line.split(':');
      return parts.length > 1 ? parts.slice(1).join(':').trim() : line.trim();
    });
    return rows.length > 0 ? rows : [''];
  };

  const serializeTableQuestions = (rows) => {
    const cleaned = rows.map(row => row.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      return '';
    }
    return cleaned.map((row, index) => {
      const prefix = String.fromCharCode(97 + index);
      return `${prefix}:${row}`;
    }).join('\n');
  };

  const handleTableQuestionChange = (language, index, value) => {
    const current = getTranslation(language);
    const rows = parseTableQuestions(current.tableQuestionValue);
    const updatedRows = [...rows];

    if (index >= rows.length) {
      updatedRows.push(value);
    } else {
      updatedRows[index] = value;
    }

    handleTranslationChange(language, 'tableQuestionValue', serializeTableQuestions(updatedRows));
  };

  const translateText = async (text, targetCode) => {
    if (!text) return '';
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        source: 'en',
        target: targetCode
      })
    });

    if (!response.ok) {
      throw new Error('Translation failed');
    }

    const data = await response.json();
    return data.translatedText || '';
  };

  const handleTranslateAll = async () => {
    if (!orderedLanguages.includes('English')) {
      alert('English must be selected to auto-translate.');
      return;
    }

    const unsupported = orderedLanguages.filter(lang => lang !== primaryLanguage && !LANGUAGE_CODE_MAP[lang]);
    if (unsupported.length > 0) {
      alert(`Translation not available for: ${unsupported.join(', ')}. Please enter manually.`);
    }

    const english = getTranslation(primaryLanguage);
    const englishHeaders = splitHeaderValue(english.tableHeaderValue);
    const englishTableQuestions = parseTableQuestions(english.tableQuestionValue).filter(row => row.trim());
    const englishOptions = english.options || [];

    try {
      setTranslating(true);
      const updatedTranslations = { ...translations };

      for (const lang of orderedLanguages) {
        if (lang === primaryLanguage) {
          continue;
        }
        const targetCode = LANGUAGE_CODE_MAP[lang];
        if (!targetCode) {
          continue;
        }

        const translation = { ...getTranslation(lang) };

        if (!translation.questionDescription && english.questionDescription) {
          translation.questionDescription = await translateText(english.questionDescription, targetCode);
        }

        if (fieldConfig?.showTableFields) {
          if (!translation.tableHeaderValue && (englishHeaders[0] || englishHeaders[1])) {
            const headerTranslations = [];
            for (const header of englishHeaders) {
              headerTranslations.push(header ? await translateText(header, targetCode) : '');
            }
            translation.tableHeaderValue = buildHeaderValue(headerTranslations);
          }

          if (!translation.tableQuestionValue && englishTableQuestions.length > 0) {
            const translatedRows = [];
            for (const row of englishTableQuestions) {
              translatedRows.push(await translateText(row, targetCode));
            }
            translation.tableQuestionValue = serializeTableQuestions(translatedRows);
          }
        }

        if (fieldConfig?.showOptions && englishOptions.length > 0) {
          const options = ensureOptionArray(translation.options || [], englishOptions.length - 1);
          const updatedOptions = options.map((option, index) => {
            const englishOption = englishOptions[index];
            if (!englishOption || !englishOption.text) {
              return option;
            }
            return {
              ...option,
              text: option.text || '',
              textInEnglish: englishOption.text,
              children: option.children || ''
            };
          });

          for (let i = 0; i < englishOptions.length; i++) {
            const englishText = englishOptions[i]?.text;
            if (englishText && !updatedOptions[i].text) {
              updatedOptions[i] = {
                ...updatedOptions[i],
                text: await translateText(englishText, targetCode)
              };
            }
          }

          translation.options = updatedOptions;
        }

        updatedTranslations[lang] = translation;
      }

      onChange(updatedTranslations);
    } catch (error) {
      alert('Auto-translation failed. Please enter translations manually.');
    } finally {
      setTranslating(false);
    }
  };

  const getCompletionStatus = (language) => {
    const translation = getTranslation(language);
    
    let totalFields = 1; // questionDescription is always required
    let filledFields = translation.questionDescription ? 1 : 0;
    
    if (fieldConfig?.showTableFields) {
      totalFields += 2; // tableHeaderValue and tableQuestionValue
      if (translation.tableHeaderValue) filledFields++;
      if (translation.tableQuestionValue) filledFields++;
    }
    
    if (fieldConfig?.showOptions) {
      const options = translation.options || [];
      if (options.length > 0) {
        filledFields++; // At least some options entered
      }
      totalFields++;
    }
    
    return `${Math.round((filledFields / totalFields) * 100)}%`;
  };

  const optionCount = getOptionCount();

  return (
    <div className="translation-panel">
      <div className="translation-toolbar">
        <div className="translation-toolbar-title">
          English is primary for auto-translation.
        </div>
        {orderedLanguages.length > 1 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleTranslateAll}
            disabled={translating}
          >
            {translating ? 'Translating...' : 'Translate from English'}
          </button>
        )}
      </div>

      <div className="translation-content">
        {orderedLanguages.map(lang => {
          const translation = getTranslation(lang);
          const headerParts = splitHeaderValue(translation.tableHeaderValue);
          const tableRows = parseTableQuestions(translation.tableQuestionValue);
          const tableRowsWithEmpty = [...tableRows, ''];

          return (
            <div key={lang} className="translation-section">
              <div className="translation-section-header">
                <h4>Translation for {lang} ({getNativeScript(lang)})</h4>
                <span className="completion-badge">{getCompletionStatus(lang)}</span>
              </div>
              
              <div className="form-group">
                <label>
                  Question Description in {lang} <span className="required">*</span>
                </label>
                <textarea
                  value={translation.questionDescription || ''}
                  onChange={(e) => handleTranslationChange(lang, 'questionDescription', e.target.value)}
                  rows="3"
                  placeholder={`Enter question text in ${lang}`}
                  required
                />
              </div>

              {fieldConfig?.showTableFields && (
                <>
                  <div className="form-group">
                    <label>
                      Table Header Value in {lang} <span className="required">*</span>
                    </label>
                    <div className="table-header-inputs">
                      <input
                        type="text"
                        value={headerParts[0]}
                        onChange={(e) => updateHeaderValue(lang, 0, e.target.value)}
                        placeholder={`Header 1 in ${lang}`}
                      />
                      <input
                        type="text"
                        value={headerParts[1]}
                        onChange={(e) => updateHeaderValue(lang, 1, e.target.value)}
                        placeholder={`Header 2 in ${lang}`}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>
                      Table Question Value in {lang} <span className="required">*</span>
                    </label>
                    <div className="table-question-list">
                      {tableRowsWithEmpty.map((row, index) => (
                        <input
                          key={`${lang}-table-${index}`}
                          type="text"
                          value={row}
                          onChange={(e) => handleTableQuestionChange(lang, index, e.target.value)}
                          placeholder="Question value"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (e.target.value.trim()) {
                                handleTableQuestionChange(lang, index, e.target.value);
                              }
                            }
                          }}
                        />
                      ))}
                      <small>Press Enter to add another row.</small>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {fieldConfig?.showOptions && (
          <div className="options-section">
            <h5>Options (shared across languages)</h5>
            <div className="options-table">
              <div className="options-table-row options-table-header">
                <div className="options-table-cell options-table-label">Language</div>
                {Array.from({ length: optionCount }).map((_, optionIndex) => (
                  <div className="options-table-cell options-table-option" key={`option-header-${optionIndex}`}>
                    <div className="options-table-option-header">
                      <span>Option {optionIndex + 1}</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => removeOption(optionIndex)}
                      >
                        Remove
                      </button>
                    </div>
                    {fieldConfig?.showOptionChildren && (
                      <input
                        type="text"
                        className="options-table-child-input"
                        value={(getTranslation(primaryLanguage).options || [])[optionIndex]?.children || ''}
                        onChange={(e) => handleOptionChildrenChange(optionIndex, e.target.value)}
                        placeholder="Child questions"
                      />
                    )}
                  </div>
                ))}
              </div>

              {orderedLanguages.map(lang => (
                <div className="options-table-row" key={`option-row-${lang}`}>
                  <div className="options-table-cell options-table-label">
                    {lang} ({getNativeScript(lang)})
                  </div>
                  {Array.from({ length: optionCount }).map((_, optionIndex) => {
                    const option = (getTranslation(lang).options || [])[optionIndex] || {};
                    const value = option.text || '';
                    const handler = lang === primaryLanguage
                      ? (e) => handleEnglishOptionChange(optionIndex, e.target.value)
                      : (e) => handleOptionTextChange(lang, optionIndex, e.target.value);

                    return (
                      <input
                        key={`${lang}-option-${optionIndex}`}
                        type="text"
                        className="options-table-cell"
                        value={value}
                        onChange={handler}
                        placeholder={`Option ${optionIndex + 1} in ${lang}`}
                      />
                    );
                  })}
                </div>
              ))}

            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addOption}
              disabled={optionCount >= (fieldConfig?.maxOptions || 20)}
            >
              Add Option ({optionCount}/{fieldConfig?.maxOptions || 20})
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranslationPanel;
