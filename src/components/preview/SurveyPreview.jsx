import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { surveyAPI, questionAPI } from '../../services/api';
import PreviewNavigation from './PreviewNavigation';
import QuestionRenderer from './QuestionRenderer';

const SurveyPreview = () => {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [availableLanguages, setAvailableLanguages] = useState(['English']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    setCurrentQuestionIndex(0);
    loadSurveyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  useEffect(() => {
    if (currentQuestionIndex >= questions.length && questions.length > 0) {
      setCurrentQuestionIndex(0);
    }
  }, [currentQuestionIndex, questions.length]);

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
      setAvailableLanguages(languages.length > 0 ? languages : ['English']);
      setSelectedLanguage((prev) => (languages.includes(prev) ? prev : (languages[0] || 'English')));
      
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

  const handleLanguageChange = (e) => {
    setSelectedLanguage(e.target.value);
  };

  const handleAnswer = (questionId, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const getQuestionOptions = (question) => {
    const translations = question.translations?.[effectiveLanguage] || {};
    return (translations.options && translations.options.length > 0)
      ? translations.options
      : (question.options || []);
  };

  const isChildTriggered = (parentQuestion, parentAnswer, childQuestionId) => {
    if (!parentQuestion || !parentAnswer) {
      return false;
    }

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
      if (!question.sourceQuestion) {
        return true;
      }
      const parent = questions.find(q => q.questionId === question.sourceQuestion);
      const parentAnswer = answers[question.sourceQuestion];
      return isChildTriggered(parent, parentAnswer, question.questionId);
    });
  }, [questions, answers, effectiveLanguage, isChildTriggered]);

  useEffect(() => {
    if (currentQuestionIndex >= visibleQuestions.length && visibleQuestions.length > 0) {
      setCurrentQuestionIndex(0);
    }
  }, [currentQuestionIndex, visibleQuestions.length]);

  const isAnswered = (question) => {
    const answer = answers[question.questionId];
    if (!answer) return false;
    if (typeof answer.answered === 'boolean') {
      return answer.answered;
    }
    if (Array.isArray(answer.value)) {
      return answer.value.length > 0;
    }
    return answer.value !== null && answer.value !== undefined && String(answer.value).trim() !== '';
  };

  const handleSubmitCurrent = () => {
    const current = visibleQuestions[currentQuestionIndex];
    if (!current) {
      return;
    }
    if (current.isMandatory === 'Yes' && !isAnswered(current)) {
      setValidationError('Please answer this question before continuing.');
      return;
    }
    setValidationError('');

    if (currentQuestionIndex < visibleQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      alert('Preview completed. You have reached the end of the survey.');
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

  const currentQuestion = visibleQuestions[currentQuestionIndex];

  return (
    <div className="survey-preview-container">
      <div className="preview-header">
        <div className="preview-title-section">
          <h1>{survey?.surveyName || 'Survey Preview'}</h1>
          <p className="preview-description">{survey?.surveyDescription || ''}</p>
        </div>
        
        <div className="preview-controls">
          {availableLanguages.length > 1 && (
            <div className="language-selector">
              <label>Preview Language: </label>
              <select 
                value={effectiveLanguage} 
                onChange={handleLanguageChange}
                className="language-dropdown"
              >
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
          )}
          
          <button 
            className="btn btn-secondary"
            onClick={() => navigate(`/surveys/${surveyId}/questions`)}
          >
            Back to Questions
          </button>
        </div>
      </div>

      <PreviewNavigation
        currentQuestion={currentQuestionIndex}
        totalQuestions={visibleQuestions.length}
        onNavigate={handleNavigate}
        questions={visibleQuestions}
      />

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
            className="btn btn-primary"
            onClick={handleSubmitCurrent}
          >
            {currentQuestionIndex < visibleQuestions.length - 1 ? 'Submit & Next' : 'Finish Preview'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/surveys/${surveyId}/questions`)}
          >
            Back to Questions
          </button>
        </div>
      </div>
    </div>
  );
};

export default SurveyPreview;
