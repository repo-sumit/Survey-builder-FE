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
      <div className="checkbox-options">
        {options.map((option, index) => (
          <label key={index} className="checkbox-option">
            <input
              type="checkbox"
              checked={selectedOptions.includes(index)}
              onChange={() => toggleOption(index)}
            />
            <span className="checkbox-label">{option.text}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default MultipleChoiceMultiRenderer;
