import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { surveyAPI, questionAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import PreviewNavigation from './PreviewNavigation';
import QuestionRenderer from './QuestionRenderer';

const SurveyPreview = () => {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [survey, setSurvey] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [availableLanguages, setAvailableLanguages] = useState(['English']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState('');
  // 'language-select' | 'survey' | 'completed'
  const [phase, setPhase] = useState('language-select');

  useEffect(() => {
    setCurrentQuestionIndex(0);
    loadSurveyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  const parseAvailableLanguages = (mediums) => {
    if (Array.isArray(mediums)) {
      return mediums.map((lang) => lang.trim()).filter(Boolean);
    }
    if (typeof mediums === 'string') {
      return mediums.split(',').map((lang) => lang.trim()).filter(Boolean);
    }
    return ['English'];
  };

  const sortQuestions = (list) => {
    const parseSegments = (questionId) => {
      const cleaned = String(questionId || '').replace(/^Q/i, '');
      return cleaned.split('.').map((part) => Number.parseInt(part, 10)).filter((num) => !Number.isNaN(num));
    };
    return [...list].sort((a, b) => {
      const aParts = parseSegments(a.questionId);
      const bParts = parseSegments(b.questionId);
      const maxLen = Math.max(aParts.length, bParts.length);
      for (let i = 0; i < maxLen; i += 1) {
        const aVal = aParts[i];
        const bVal = bParts[i];
        if (aVal === undefined) return -1;
        if (bVal === undefined) return 1;
        if (aVal !== bVal) return aVal - bVal;
      }
      return 0;
    });
  };

  const loadSurveyData = async () => {
    try {
      setLoading(true);
      const surveyData = await surveyAPI.getById(surveyId);
      const questionsData = await questionAPI.getAll(surveyId);

      setSurvey(surveyData);
      setQuestions(sortQuestions(questionsData));
      setAnswers({});

      const languages = parseAvailableLanguages(surveyData.availableMediums);
      const finalLanguages = languages.length > 0 ? languages : ['English'];
      setAvailableLanguages(finalLanguages);
      setSelectedLanguage(finalLanguages[0] || 'English');

      if (finalLanguages.length <= 1) {
        setPhase('survey');
      } else {
        setPhase('language-select');
      }

      setError(null);
    } catch (err) {
      setError('Failed to load survey data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const effectiveLanguage = availableLanguages.includes(selectedLanguage)
    ? selectedLanguage
    : (availableLanguages[0] || 'English');

  const handleNavigate = (index) => {
    setCurrentQuestionIndex(index);
    setValidationError('');
  };

  const handleAnswer = (questionId, answer) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const getQuestionOptions = (question) => {
    const translations = question.translations?.[effectiveLanguage] || {};
    return (translations.options && translations.options.length > 0)
      ? translations.options
      : (question.options || []);
  };

  const isChildTriggered = (parentQuestion, parentAnswer, childQuestionId) => {
    if (!parentQuestion || !parentAnswer) return false;
    const options = getQuestionOptions(parentQuestion);
    const selectedIndices = Array.isArray(parentAnswer.value)
      ? parentAnswer.value
      : parentAnswer.value !== null && parentAnswer.value !== undefined
        ? [parentAnswer.value]
        : [];
    return selectedIndices.some((index) => {
      const option = options[index];
      if (!option || !option.children) return false;
      const children = option.children.split(',').map(child => child.trim()).filter(Boolean);
      return children.includes(childQuestionId);
    });
  };

  const visibleQuestions = useMemo(() => {
    return questions.filter((question) => {
      if (!question.sourceQuestion) return true;
      const parent = questions.find(q => q.questionId === question.sourceQuestion);
      const parentAnswer = answers[question.sourceQuestion];
      return isChildTriggered(parent, parentAnswer, question.questionId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, answers, effectiveLanguage]);

  useEffect(() => {
    if (currentQuestionIndex >= visibleQuestions.length && visibleQuestions.length > 0) {
      setCurrentQuestionIndex(0);
    }
  }, [currentQuestionIndex, visibleQuestions.length]);

  const isAnswered = (question) => {
    const answer = answers[question.questionId];
    if (!answer) return false;
    if (typeof answer.answered === 'boolean') return answer.answered;
    if (Array.isArray(answer.value)) return answer.value.length > 0;
    return answer.value !== null && answer.value !== undefined && String(answer.value).trim() !== '';
  };

  const handleSubmitCurrent = () => {
    const current = visibleQuestions[currentQuestionIndex];
    if (!current) return;
    if (current.isMandatory === 'Yes' && !isAnswered(current)) {
      setValidationError('Please answer this question before continuing.');
      return;
    }
    setValidationError('');
    if (currentQuestionIndex < visibleQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      setPhase('completed');
    }
  };

  if (loading) {
    return <div className="loading">Loading preview...</div>;
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-message">{error}</div>
        <button className="btn btn-primary" onClick={() => navigate(`/surveys/${surveyId}/questions`)}>
          Back to Questions
        </button>
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="empty-state">
        <p>No questions available for preview</p>
        <button className="btn btn-primary" onClick={() => navigate(`/surveys/${surveyId}/questions`)}>
          Back to Questions
        </button>
      </div>
    );
  }

  // ── Language selection screen ──────────────────────────────────────────────
  if (phase === 'language-select') {
    return (
      <div className="preview-lang-select-page">
        <div className="preview-lang-card">
          <h2 className="preview-lang-survey-name">{survey?.surveyName}</h2>
          {survey?.surveyDescription && (
            <p className="preview-lang-survey-desc">{survey.surveyDescription}</p>
          )}
          <p className="preview-lang-prompt">Please select your preferred language to begin the survey.</p>
          <div className="preview-lang-options">
            {availableLanguages.map(lang => (
              <button
                key={lang}
                className={`preview-lang-btn ${selectedLanguage === lang ? 'selected' : ''}`}
                onClick={() => setSelectedLanguage(lang)}
              >
                {lang}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary preview-lang-start-btn"
            onClick={() => setPhase('survey')}
          >
            Start Survey
          </button>
        </div>
      </div>
    );
  }

  // ── Survey completed screen ────────────────────────────────────────────────
  if (phase === 'completed') {
    return (
      <div className="preview-completed-page">
        <div className="preview-completed-card">
          <div className="preview-completed-checkmark">✓</div>
          <h2 className="preview-completed-title">Survey Completed</h2>
          <p className="preview-completed-desc">
            You have successfully completed the preview of <strong>{survey?.surveyName}</strong>.
          </p>
          <div className="preview-completed-actions">
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/surveys/${surveyId}/questions`)}
            >
              Go to Question Master
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setAnswers({});
                setCurrentQuestionIndex(0);
                setPhase(availableLanguages.length > 1 ? 'language-select' : 'survey');
              }}
            >
              Restart Preview
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main survey screen ─────────────────────────────────────────────────────
  const currentQuestion = visibleQuestions[currentQuestionIndex];

  return (
    <div className="survey-preview-container">
      {/* Survey Info Header */}
      <div className="preview-info-header">
        <div className="preview-info-cell">
          <span className="preview-info-label">Survey Name</span>
          <span className="preview-info-value">{survey?.surveyName}</span>
        </div>
        <div className="preview-info-cell">
          <span className="preview-info-label">Survey ID</span>
          <span className="preview-info-value">{survey?.surveyId || surveyId}</span>
        </div>
        <div className="preview-info-cell">
          <span className="preview-info-label">User ID</span>
          <span className="preview-info-value">{user?.username || '-'}</span>
        </div>
        <div className="preview-info-cell">
          <span className="preview-info-label">Employee Name</span>
          <span className="preview-info-value">{user?.name || user?.username || '-'}</span>
        </div>
      </div>

      {/* Navigation */}
      <PreviewNavigation
        currentQuestion={currentQuestionIndex}
        totalQuestions={visibleQuestions.length}
        onNavigate={handleNavigate}
        questions={visibleQuestions}
        answeredQuestions={answers}
        isAnswered={isAnswered}
      />

      {/* Question Content */}
      <div className="preview-content">
        {validationError && (
          <div className="error-message" style={{ marginBottom: '1rem' }}>
            {validationError}
          </div>
        )}
        <QuestionRenderer
          key={currentQuestion?.questionId || 'preview-question'}
          question={currentQuestion}
          language={effectiveLanguage}
          answer={answers[currentQuestion?.questionId]}
          onAnswer={handleAnswer}
        />
        <div className="preview-cta">
          <button
            className="preview-prev-link"
            onClick={() => {
              if (currentQuestionIndex > 0) {
                setCurrentQuestionIndex(prev => prev - 1);
                setValidationError('');
              }
            }}
            disabled={currentQuestionIndex === 0}
          >
            Previous
          </button>
          <button
            className="btn btn-primary preview-save-continue-btn"
            onClick={handleSubmitCurrent}
          >
            {currentQuestionIndex < visibleQuestions.length - 1 ? 'Save and Continue' : 'Submit Survey'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SurveyPreview;
