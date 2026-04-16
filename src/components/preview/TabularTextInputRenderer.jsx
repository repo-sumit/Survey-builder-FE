import React, { useEffect, useState } from 'react';

const INPUT_PATTERNS = {
  Numeric: { pattern: /[^0-9.\-]/g, inputMode: 'decimal', placeholder: 'Enter a number' },
  Alphabets: { pattern: /[^a-zA-Z\s]/g, inputMode: 'text', placeholder: 'Enter alphabets only' },
  Alphanumeric: { pattern: /[^a-zA-Z0-9\s]/g, inputMode: 'text', placeholder: 'Enter text (letters and numbers)' },
  None: { pattern: null, inputMode: 'text', placeholder: 'Enter text' }
};

const TabularTextInputRenderer = ({ question, language, onAnswer }) => {
  const translations = question.translations?.[language] || {};
  const tableHeaderValue = translations.tableHeaderValue || question.tableHeaderValue || '';
  const tableQuestionValue = translations.tableQuestionValue || question.tableQuestionValue || '';
  const inputType = question.textInputType || 'None';
  const minValue = question.minValue != null ? Number(question.minValue) : null;
  const maxValue = question.maxValue != null ? Number(question.maxValue) : null;
  const maxLength = question.textLimitCharacters || 1024;
  const config = INPUT_PATTERNS[inputType] || INPUT_PATTERNS.None;

  const parseHeaders = (value) => {
    if (!value) return [];
    const delimiter = value.includes('|') ? '|' : ',';
    return value.split(delimiter).map((header) => header.trim()).filter(Boolean);
  };

  const tableHeaders = parseHeaders(tableHeaderValue);
  const headerOne = tableHeaders[0] || 'Option No';
  const headerTwo = tableHeaders[1] || 'Text Input';
  const tableQuestions = tableQuestionValue?.split('\n')
    .map(line => {
      const [key, value] = line.split(':');
      return { key: key?.trim(), value: value?.trim() };
    })
    .filter(q => q.key && q.value) || [];

  const [responses, setResponses] = useState([]);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    setResponses(tableQuestions.map(() => ''));
    setErrors(tableQuestions.map(() => ''));
  }, [question.questionId, tableQuestionValue]);

  const handleChange = (index, raw) => {
    let filtered = raw;

    // Filter characters based on input type
    if (config.pattern) {
      filtered = raw.replace(config.pattern, '');
    }

    // Enforce max length
    if (filtered.length > maxLength) {
      filtered = filtered.slice(0, maxLength);
    }

    // Validate min/max for numeric input
    const newErrors = [...errors];
    if (inputType === 'Numeric' && filtered !== '' && filtered !== '-') {
      const num = parseFloat(filtered);
      if (!isNaN(num)) {
        if (minValue != null && num < minValue) {
          newErrors[index] = `Min: ${minValue}`;
        } else if (maxValue != null && num > maxValue) {
          newErrors[index] = `Max: ${maxValue}`;
        } else {
          newErrors[index] = '';
        }
      }
    } else {
      newErrors[index] = '';
    }
    setErrors(newErrors);

    setResponses(prev => {
      const next = [...prev];
      next[index] = filtered;
      const answered = next.some(entry => entry && entry.trim() !== '');
      onAnswer?.(question.questionId, { value: next, answered });
      return next;
    });
  };

  return (
    <div className="tabular-text-input-renderer">
      {inputType !== 'None' && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-3, #888)', marginBottom: '0.5rem' }}>
          Input: {inputType}
          {inputType === 'Numeric' && minValue != null && ` | Min: ${minValue}`}
          {inputType === 'Numeric' && maxValue != null && ` | Max: ${maxValue}`}
        </div>
      )}
      <table className="preview-table">
        <thead>
          <tr>
            <th>{headerOne}</th>
            <th>{headerTwo}</th>
          </tr>
        </thead>
        <tbody>
          {tableQuestions.map((tq, idx) => (
            <tr key={idx}>
              <td className="row-label">{tq.value}</td>
              <td>
                <input
                  type="text"
                  className={`preview-text-input${errors[idx] ? ' error' : ''}`}
                  placeholder={config.placeholder}
                  inputMode={config.inputMode}
                  maxLength={maxLength}
                  value={responses[idx] || ''}
                  onChange={(e) => handleChange(idx, e.target.value)}
                />
                {errors[idx] && <div style={{ color: 'var(--danger, #dc3545)', fontSize: '0.75rem', marginTop: '2px' }}>{errors[idx]}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TabularTextInputRenderer;
