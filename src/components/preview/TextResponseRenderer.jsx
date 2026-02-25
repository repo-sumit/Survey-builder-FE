import React from 'react';

const TextResponseRenderer = ({ question, value, onChange }) => {
  const maxLength = question.textLimitCharacters || 1024;

  return (
    <div className="text-response-renderer">
      <textarea
        className="preview-textarea"
        placeholder="Write Your Short Answer"
        maxLength={maxLength}
        rows={4}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
      <div className="text-limit-info">
        Character limit: {maxLength}
      </div>
    </div>
  );
};

export default TextResponseRenderer;
