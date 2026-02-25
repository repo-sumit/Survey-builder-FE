import React from 'react';

const DropDownRenderer = ({ question, language, value, onChange }) => {
  const translations = question.translations?.[language] || {};
  const options = (translations.options && translations.options.length > 0)
    ? translations.options
    : (question.options || []);
  const optionalDescription = translations.questionDescriptionOptional || question.questionDescriptionOptional || '';

  return (
    <div className="dropdown-renderer">
      {optionalDescription && (
        <div className="optional-description">{optionalDescription}</div>
      )}
      <select
        className="preview-dropdown-select"
        value={value === null || value === undefined ? '' : value}
        onChange={(e) => {
          const nextValue = e.target.value === '' ? null : Number(e.target.value);
          onChange?.(nextValue);
        }}
      >
        <option value="">Select an option...</option>
        {options.map((option, index) => (
          <option key={index} value={index}>
            {option.text}
          </option>
        ))}
      </select>
    </div>
  );
};

export default DropDownRenderer;
