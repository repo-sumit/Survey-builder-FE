import React from 'react';

const PreviewNavigation = ({
  currentQuestion,
  totalQuestions,
  onNavigate,
  questions,
  isAnswered
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

  const getChipClass = (q, index) => {
    if (index === currentQuestion) return 'question-chip active';
    if (isAnswered && isAnswered(q)) return 'question-chip answered';
    return 'question-chip';
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
              className={getChipClass(q, index)}
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
    </div>
  );
};

export default PreviewNavigation;
