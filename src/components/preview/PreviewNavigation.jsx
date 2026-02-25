import React from 'react';

const PreviewNavigation = ({ 
  currentQuestion, 
  totalQuestions, 
  onNavigate, 
  questions 
}) => {
  const handlePrevious = () => {
    if (currentQuestion > 0) {
      onNavigate(currentQuestion - 1);
    }
  };

  const handleNext = () => {
    if (currentQuestion < totalQuestions - 1) {
      onNavigate(currentQuestion + 1);
    }
  };

  return (
    <div className="preview-navigation">
      <div className="nav-controls">
        <button 
          className="nav-arrow"
          onClick={handlePrevious}
          disabled={currentQuestion === 0}
        >
          ‹
        </button>
        
        <div className="question-chips">
          {questions.map((q, index) => (
            <button
              key={q.questionId}
              className={`question-chip ${index === currentQuestion ? 'active' : ''}`}
              onClick={() => onNavigate(index)}
            >
              {q.questionId}
            </button>
          ))}
        </div>
        
        <button 
          className="nav-arrow"
          onClick={handleNext}
          disabled={currentQuestion === totalQuestions - 1}
        >
          ›
        </button>
      </div>
      
      <div className="progress-indicator">
        Q{currentQuestion + 1} / {totalQuestions}
      </div>
    </div>
  );
};

export default PreviewNavigation;
