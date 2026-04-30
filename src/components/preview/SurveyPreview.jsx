import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { surveyAPI, questionAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import PreviewNavigation from './PreviewNavigation';
import QuestionRenderer from './QuestionRenderer';

const DUMMY_USERS = {
  '1001': { name: 'Test User 1', designation: 'School Inspector' },
  '1002': { name: 'Test User 2', designation: 'Teacher' },
  '1003': { name: 'Test User 3', designation: 'CRC/BRC' },
  '1004': { name: 'Test User 4', designation: 'Principal' },
  '1005': { name: 'Test User 5', designation: 'DEO' }
};

const UserAvatarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const SchoolIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18" />
    <path d="M5 21V8l7-5 7 5v13" />
    <rect x="9" y="13" width="6" height="8" />
    <circle cx="12" cy="9" r="1" fill="currentColor" />
  </svg>
);

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
  // 'user-login' | 'user-verify' | 'language-select' | 'udise-input' | 'udise-verified' | 'survey' | 'completed'
  const [phase, setPhase] = useState('user-login');

  // Onboarding state
  const [userIdInput, setUserIdInput] = useState('');
  const [userIdError, setUserIdError] = useState('');
  const [previewUser, setPreviewUser] = useState(null);
  const [udiseInput, setUdiseInput] = useState('');
  const [udiseError, setUdiseError] = useState('');
  const [verifiedSchool, setVerifiedSchool] = useState(null);

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
      setPhase('user-login');
      setError(null);
    } catch (err) {
      setError('Failed to load survey data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isSchoolSurvey = String(survey?.inSchool || '').trim().toLowerCase() === 'yes';

  // After user verification, decide which onboarding screen comes next.
  const advanceFromUserVerify = () => {
    if (availableLanguages.length > 1) {
      setPhase('language-select');
      return;
    }
    if (isSchoolSurvey) {
      setPhase('udise-input');
      return;
    }
    setPhase('survey');
  };

  const advanceFromLanguage = () => {
    if (isSchoolSurvey) {
      setPhase('udise-input');
      return;
    }
    setPhase('survey');
  };

  const handleUserIdSubmit = (e) => {
    e?.preventDefault?.();
    const trimmed = String(userIdInput).trim();
    if (!trimmed) {
      setUserIdError('User ID is required');
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      setUserIdError('User ID must be numeric');
      return;
    }
    const matched = DUMMY_USERS[trimmed];
    if (!matched) {
      setUserIdError('User ID not found. Try one of: ' + Object.keys(DUMMY_USERS).join(', '));
      return;
    }
    setUserIdError('');
    setPreviewUser({ userId: trimmed, ...matched });
    setPhase('user-verify');
  };

  const handleUdiseSubmit = (e) => {
    e?.preventDefault?.();
    const trimmed = String(udiseInput).trim();
    if (!trimmed) {
      setUdiseError('UDISE Code is required');
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      setUdiseError('UDISE Code must be numeric');
      return;
    }
    setUdiseError('');
    setVerifiedSchool({
      schoolName: 'Government Primary School, Ahmedabad',
      udiseCode: trimmed,
      district: 'Ahmedabad',
      state: 'Gujarat'
    });
    setPhase('udise-verified');
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

  // ── Onboarding: User ID login ──────────────────────────────────────────────
  if (phase === 'user-login') {
    return (
      <div className="preview-onboarding-page">
        <ExitBar onExit={() => navigate(`/surveys/${surveyId}/questions`)} />
        <form className="preview-onboarding-card" onSubmit={handleUserIdSubmit}>
          <div className="preview-onboarding-avatar"><UserAvatarIcon /></div>
          <h2 className="preview-onboarding-title">FMB Demo Preview</h2>
          <p className="preview-onboarding-subtitle">Enter your User ID to access your surveys</p>
          <div className="preview-onboarding-field">
            <label htmlFor="preview-user-id">User ID</label>
            <input
              id="preview-user-id"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={userIdInput}
              onChange={(e) => {
                const v = e.target.value.replace(/\D+/g, '');
                setUserIdInput(v);
                if (userIdError) setUserIdError('');
              }}
              placeholder="Enter your User ID"
              className={userIdError ? 'has-error' : ''}
            />
            {userIdError && <span className="preview-onboarding-error">{userIdError}</span>}
          </div>
          <button type="submit" className="btn btn-primary preview-onboarding-cta">Continue</button>
        </form>
      </div>
    );
  }

  // ── Onboarding: Verify Your Details ────────────────────────────────────────
  if (phase === 'user-verify' && previewUser) {
    return (
      <div className="preview-onboarding-page">
        <ExitBar onExit={() => navigate(`/surveys/${surveyId}/questions`)} />
        <div className="preview-onboarding-card">
          <div className="preview-onboarding-avatar"><UserAvatarIcon /></div>
          <h2 className="preview-onboarding-title">Verify Your Details</h2>
          <p className="preview-onboarding-subtitle">Please confirm your details below to continue</p>
          <div className="preview-verify-list">
            <div className="preview-verify-row"><span>Name:</span><span>{previewUser.name}</span></div>
            <div className="preview-verify-row"><span>User ID:</span><span>{previewUser.userId}</span></div>
            <div className="preview-verify-row"><span>Designation:</span><span>{previewUser.designation}</span></div>
          </div>
          <button className="btn btn-primary preview-onboarding-cta" onClick={advanceFromUserVerify}>
            Continue & Sign In
          </button>
          <button
            className="btn preview-onboarding-cta preview-onboarding-secondary"
            onClick={() => { setPreviewUser(null); setPhase('user-login'); }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ── Onboarding: Language Selection (modal) ─────────────────────────────────
  if (phase === 'language-select') {
    return (
      <div className="preview-onboarding-page preview-onboarding-faded">
        <ExitBar onExit={() => navigate(`/surveys/${surveyId}/questions`)} />
        <div className="preview-modal-backdrop" />
        <div className="preview-modal" role="dialog" aria-modal="true">
          <button
            className="preview-modal-close"
            onClick={() => navigate(`/surveys/${surveyId}/questions`)}
            aria-label="Close"
          >
            ×
          </button>
          <h3 className="preview-modal-title">Choose your preferred language</h3>
          <p className="preview-modal-desc">Select the language in which you want to fill the survey.</p>
          <div className="preview-onboarding-field">
            <label htmlFor="preview-language">Language</label>
            <select
              id="preview-language"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
            >
              {availableLanguages.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary preview-onboarding-cta"
            onClick={advanceFromLanguage}
            disabled={!selectedLanguage}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // ── Onboarding: UDISE Code input ───────────────────────────────────────────
  if (phase === 'udise-input') {
    return (
      <div className="preview-onboarding-page">
        <ExitBar onExit={() => navigate(`/surveys/${surveyId}/questions`)} />
        <form className="preview-onboarding-card preview-onboarding-card-school" onSubmit={handleUdiseSubmit}>
          <div className="preview-onboarding-avatar preview-onboarding-avatar-school"><SchoolIcon /></div>
          <h2 className="preview-onboarding-title">Enter School UDISE Code</h2>
          <p className="preview-onboarding-subtitle">
            Please enter the 11-digit UDISE code of your school to proceed with the survey.
          </p>
          <div className="preview-onboarding-field">
            <label htmlFor="preview-udise">UDISE Code <span className="required">*</span></label>
            <input
              id="preview-udise"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={udiseInput}
              onChange={(e) => {
                const v = e.target.value.replace(/\D+/g, '');
                setUdiseInput(v);
                if (udiseError) setUdiseError('');
              }}
              placeholder="Enter 11-digit UDISE code"
              className={udiseError ? 'has-error' : ''}
            />
            {udiseError && <span className="preview-onboarding-error">{udiseError}</span>}
          </div>
          <button type="submit" className="btn btn-primary preview-onboarding-cta">Validate UDISE Code</button>
          <p className="preview-onboarding-help">
            Need help finding your UDISE code?<br />
            Contact your school administration or district education office.
          </p>
        </form>
      </div>
    );
  }

  // ── Onboarding: UDISE Verified card ────────────────────────────────────────
  if (phase === 'udise-verified' && verifiedSchool) {
    return (
      <div className="preview-onboarding-page">
        <ExitBar onExit={() => navigate(`/surveys/${surveyId}/questions`)} />
        <div className="preview-school-verified">
          <div className="preview-school-verified-header">
            <span className="preview-school-verified-check">✓</span>
            <strong>School Verified</strong>
          </div>
          <div className="preview-school-verified-grid">
            <div className="preview-school-verified-cell preview-school-verified-cell-full">
              <span className="preview-school-verified-label">School Name</span>
              <span className="preview-school-verified-value">{verifiedSchool.schoolName}</span>
            </div>
            <div className="preview-school-verified-cell preview-school-verified-cell-full">
              <span className="preview-school-verified-label">UDISE Code</span>
              <span className="preview-school-verified-value">{verifiedSchool.udiseCode}</span>
            </div>
            <div className="preview-school-verified-cell">
              <span className="preview-school-verified-label">District</span>
              <span className="preview-school-verified-value">{verifiedSchool.district}</span>
            </div>
            <div className="preview-school-verified-cell">
              <span className="preview-school-verified-label">State</span>
              <span className="preview-school-verified-value">{verifiedSchool.state}</span>
            </div>
          </div>
          <button className="btn btn-primary preview-onboarding-cta" onClick={() => setPhase('survey')}>
            Proceed to Survey
          </button>
          <button
            className="btn preview-onboarding-cta preview-onboarding-secondary"
            onClick={() => { setVerifiedSchool(null); setUdiseInput(''); setPhase('udise-input'); }}
          >
            Enter Another / Go Back
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
                setPreviewUser(null);
                setUserIdInput('');
                setVerifiedSchool(null);
                setUdiseInput('');
                setPhase('user-login');
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

  const handleExitPreview = () => {
    navigate(`/surveys/${surveyId}/questions`);
  };

  return (
    <div className="survey-preview-container">
      {/* Exit bar */}
      <div className="preview-exit-bar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button
          className="btn btn-secondary preview-exit-btn"
          onClick={handleExitPreview}
          title="Exit preview and return to Question Master"
        >
          ← Exit Preview
        </button>
      </div>

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
          <span className="preview-info-value">{previewUser?.userId || user?.username || '-'}</span>
        </div>
        <div className="preview-info-cell">
          <span className="preview-info-label">Employee Name</span>
          <span className="preview-info-value">{previewUser?.name || user?.name || user?.username || '-'}</span>
        </div>
        {previewUser?.designation && (
          <div className="preview-info-cell">
            <span className="preview-info-label">Designation</span>
            <span className="preview-info-value">{previewUser.designation}</span>
          </div>
        )}
        {verifiedSchool && (
          <div className="preview-info-cell">
            <span className="preview-info-label">UDISE Code</span>
            <span className="preview-info-value">{verifiedSchool.udiseCode}</span>
          </div>
        )}
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

const ExitBar = ({ onExit }) => (
  <div className="preview-exit-bar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
    <button
      className="btn btn-secondary preview-exit-btn"
      onClick={onExit}
      title="Exit preview and return to Question Master"
    >
      ← Exit Preview
    </button>
  </div>
);

export default SurveyPreview;
