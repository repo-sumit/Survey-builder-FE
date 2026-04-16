import React, { useState } from 'react';

const INPUT_PATTERNS = {
  Numeric: { pattern: /[^0-9.\-]/g, inputMode: 'decimal', placeholder: 'Enter a number' },
  Alphabets: { pattern: /[^a-zA-Z\s]/g, inputMode: 'text', placeholder: 'Enter alphabets only' },
  Alphanumeric: { pattern: /[^a-zA-Z0-9\s]/g, inputMode: 'text', placeholder: 'Enter text (letters and numbers)' },
  None: { pattern: null, inputMode: 'text', placeholder: 'Write Your Short Answer' }
};

const TextResponseRenderer = ({ question, value, onChange }) => {
  const maxLength = question.textLimitCharacters || 1024;
  const inputType = question.textInputType || 'None';
  const minValue = question.minValue != null ? Number(question.minValue) : null;
  const maxValue = question.maxValue != null ? Number(question.maxValue) : null;
  const config = INPUT_PATTERNS[inputType] || INPUT_PATTERNS.None;
  const [error, setError] = useState('');

  const handleChange = (raw) => {
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
    if (inputType === 'Numeric' && filtered !== '' && filtered !== '-') {
      const num = parseFloat(filtered);
      if (!isNaN(num)) {
        if (minValue != null && num < minValue) {
          setError(`Minimum value is ${minValue}`);
        } else if (maxValue != null && num > maxValue) {
          setError(`Maximum value is ${maxValue}`);
        } else {
          setError('');
        }
      }
    } else {
      setError('');
    }

    onChange?.(filtered);
  };

  return (
    <div className="text-response-renderer">
      <textarea
        className={`preview-textarea${error ? ' error' : ''}`}
        placeholder={config.placeholder}
        maxLength={maxLength}
        inputMode={config.inputMode}
        rows={4}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
      />
      <div className="text-limit-info" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
        <span>
          {inputType !== 'None' && `Input: ${inputType}`}
          {inputType === 'Numeric' && minValue != null && ` | Min: ${minValue}`}
          {inputType === 'Numeric' && maxValue != null && ` | Max: ${maxValue}`}
        </span>
        <span>{value?.length || 0} / {maxLength}</span>
      </div>
      {error && <div className="preview-validation-error" style={{ color: 'var(--danger, #dc3545)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{error}</div>}
    </div>
  );
};

export default TextResponseRenderer;
