import React, { useEffect, useState } from 'react';

const MultipleChoiceMultiRenderer = ({ question, language, value, onChange }) => {
  const [selectedOptions, setSelectedOptions] = useState(value || []);
  const translations = question.translations?.[language] || {};
  const options = (translations.options && translations.options.length > 0)
    ? translations.options
    : (question.options || []);

  const toggleOption = (index) => {
    setSelectedOptions(prev => {
      const next = prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index];
      onChange?.(next);
      return next;
    });
  };

  useEffect(() => {
    setSelectedOptions(value || []);
  }, [value]);

  return (
    <div className="multiple-choice-multi-renderer">
      {options.map((option, index) => (
        <div
          key={index}
          className={`mc-multi-row ${selectedOptions.includes(index) ? 'selected' : ''}`}
          onClick={() => toggleOption(index)}
        >
          <span className="mc-multi-text">{option.text}</span>
          <input
            type="checkbox"
            className="mc-multi-checkbox"
            checked={selectedOptions.includes(index)}
            onChange={() => toggleOption(index)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ))}
    </div>
  );
};

export default MultipleChoiceMultiRenderer;
