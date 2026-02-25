import React, { useEffect, useState } from 'react';

const MultipleChoiceSingleRenderer = ({ question, language, value, onChange }) => {
  const [selectedOption, setSelectedOption] = useState(value ?? null);
  const translations = question.translations?.[language] || {};
  const options = (translations.options && translations.options.length > 0)
    ? translations.options
    : (question.options || []);

  const handleSelect = (index) => {
    setSelectedOption(index);
    onChange?.(index);
  };

  useEffect(() => {
    setSelectedOption(value ?? null);
  }, [value]);

  return (
    <div className="multiple-choice-single-renderer">
      <div className="pill-buttons">
        {options.map((option, index) => (
          <button
            key={index}
            className={`pill-button ${selectedOption === index ? 'selected' : ''}`}
            onClick={() => handleSelect(index)}
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MultipleChoiceSingleRenderer;
