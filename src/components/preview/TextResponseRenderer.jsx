import React, { useState } from 'react';

const INPUT_PATTERNS = {
  Numeric: { pattern: /[^0-9.\-]/g, inputMode: 'decimal', placeholder: 'Enter a number' },
  Alphabets: { pattern: /[^a-zA-Z\s]/g, inputMode: 'text', placeholder: 'Enter alphabets only' },
  Alphanumeric: { pattern: /[^a-zA-Z0-9\s]/g, inputMode: 'text', placeholder: 'Enter text (letters and numbers)' },
  None: { pattern: null, inputMode: 'text', placeholder: 'Write Your Short Answer' }
};

// Return number only if value is explicitly set (not null, undefined, or empty string)
const parseOptionalNumber = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
};

const TextResponseRenderer = ({ question, value, onChange }) => {
  const textLimitRaw = parseOptionalNumber(question.textLimitCharacters);
  const hasTextLimit = textLimitRaw !== null && textLimitRaw > 0;
  const maxLength = hasTextLimit ? textLimitRaw : undefined;
  const inputType = question.textInputType || 'None';
  const minValue = parseOptionalNumber(question.minValue);
  const maxValue = parseOptionalNumber(question.maxValue);
  const config = INPUT_PATTERNS[inputType] || INPUT_PATTERNS.None;
  const [error, setError] = useState('');

  const handleChange = (raw) => {
    let filtered = raw;

    // Filter characters based on input type
    if (config.pattern) {
      filtered = raw.replace(config.pattern, '');
    }

    // Enforce max length only when set
    if (hasTextLimit && filtered.length > maxLength) {
      filtered = filtered.slice(0, maxLength);
    }

    // Validate min/max for numeric input only when provided
    if (inputType === 'Numeric' && filtered !== '' && filtered !== '-') {
      const num = parseFloat(filtered);
      if (!isNaN(num)) {
        if (minValue !== null && num < minValue) {
          setError(`Minimum value is ${minValue}`);
        } else if (maxValue !== null && num > maxValue) {
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

  const showMetaBar = inputType !== 'None' || hasTextLimit;

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
      {showMetaBar && (
        <div className="text-limit-info" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
          <span>
            {inputType !== 'None' && `Input: ${inputType}`}
            {inputType === 'Numeric' && minValue !== null && ` | Min: ${minValue}`}
            {inputType === 'Numeric' && maxValue !== null && ` | Max: ${maxValue}`}
          </span>
          {hasTextLimit && <span>{value?.length || 0} / {maxLength}</span>}
        </div>
      )}
      {error && <div className="preview-validation-error" style={{ color: 'var(--danger, #dc3545)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{error}</div>}
    </div>
  );
};

export default TextResponseRenderer;
