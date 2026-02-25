import React, { useState } from 'react';

const TabularCheckBoxRenderer = ({ question, language, onAnswer }) => {
  const [selections, setSelections] = useState({});
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
  const headerTwo = tableHeaders[1] || 'Select';
  const tableQuestions = tableQuestionValue?.split('\n')
    .map(line => {
      const [key, value] = line.split(':');
      return { key: key?.trim(), value: value?.trim() };
    })
    .filter(q => q.key && q.value) || [];

  const handleCheckboxChange = (rowIdx, colIdx) => {
    const key = `${rowIdx}-${colIdx}`;
    setSelections(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
    onAnswer?.(question.questionId, { value: true, answered: true });
  };

  return (
    <div className="tabular-checkbox-renderer">
      <table className="preview-table">
        <thead>
          <tr>
            <th>{headerOne}</th>
            <th>{headerTwo}</th>
          </tr>
        </thead>
        <tbody>
          {tableQuestions.map((tq, rowIdx) => (
            <tr key={rowIdx}>
              <td className="row-label">{tq.value}</td>
              <td>
                <input
                  type="checkbox"
                  checked={selections[`${rowIdx}-0`] || false}
                  onChange={() => handleCheckboxChange(rowIdx, 0)}
                  className="preview-checkbox"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TabularCheckBoxRenderer;
