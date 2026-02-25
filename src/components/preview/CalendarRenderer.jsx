import React, { useState, useEffect } from 'react';

const CalendarRenderer = ({ question, value, onChange }) => {
  const [selectedDate, setSelectedDate] = useState(value || '');

  useEffect(() => {
    setSelectedDate(value || '');
  }, [value]);

  return (
    <div className="calendar-renderer">
      <input
        type="date"
        className="preview-date-input"
        value={selectedDate}
        onChange={(e) => {
          setSelectedDate(e.target.value);
          onChange?.(e.target.value);
        }}
      />
    </div>
  );
};

export default CalendarRenderer;
