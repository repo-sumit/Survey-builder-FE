import React, { useEffect, useState } from 'react';

const LikertScaleRenderer = ({ question, language, value, onChange }) => {
  const [selectedValue, setSelectedValue] = useState(value ?? null);
  const translations = question.translations?.[language] || {};
  const options = (translations.options && translations.options.length > 0)
    ? translations.options
    : (question.options || []);

  useEffect(() => {
    setSelectedValue(value ?? null);
  }, [value]);

  return (
    <div className="likert-scale-renderer">
      <div className="likert-scale">
        {options.map((option, index) => (
          <button
            key={index}
            className={`likert-button ${selectedValue === index ? 'selected' : ''}`}
            onClick={() => {
              setSelectedValue(index);
              onChange?.(index);
            }}
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
};

export default LikertScaleRenderer;
