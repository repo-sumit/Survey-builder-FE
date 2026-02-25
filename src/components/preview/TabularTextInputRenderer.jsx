import React, { useEffect, useState } from 'react';

const TabularTextInputRenderer = ({ question, language, onAnswer }) => {
  const translations = question.translations?.[language] || {};
  const tableHeaderValue = translations.tableHeaderValue || question.tableHeaderValue || '';
  const tableQuestionValue = translations.tableQuestionValue || question.tableQuestionValue || '';

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

  useEffect(() => {
    setResponses(tableQuestions.map(() => ''));
  }, [question.questionId, tableQuestionValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (index, value) => {
    setResponses(prev => {
      const next = [...prev];
      next[index] = value;
      const answered = next.some(entry => entry && entry.trim() !== '');
      onAnswer?.(question.questionId, { value: next, answered });
      return next;
    });
  };

  return (
    <div className="tabular-text-input-renderer">
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
                  className="preview-text-input"
                  placeholder="Enter text"
                  value={responses[idx] || ''}
                  onChange={(e) => handleChange(idx, e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TabularTextInputRenderer;
