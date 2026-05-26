import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { surveyAPI, questionAPI } from '../../services/api';
import QuestionRenderer from './QuestionRenderer';
import PageHeader from '../ui/PageHeader';
import Icon from '../ui/Icon';
import Chip from '../ui/Chip';

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

/* ─── Status bar + mobile header rendered inside every PhoneFrame ──── */
const PhoneStatusBar = () => (
  <div className="fmb-sp-statusbar" aria-hidden="true">
    <span>9:41</span>
    <span className="fmb-sp-statusbar-right">
      <span className="fmb-sp-statusbar-bars"><span /><span /><span /><span /></span>
      <span className="fmb-sp-statusbar-batt" />
    </span>
  </div>
);

const PhoneFrame = ({ surveyName, surveySubtitle, compact = false, children }) => (
  <div className="fmb-sp-phone" role="region" aria-label="Mobile preview frame" data-testid="sp-phone-frame">
    <PhoneStatusBar />
    <div className="fmb-sp-mobile-header">
      <div className="fmb-sp-mobile-header-logo" aria-hidden="true">SC</div>
      <div className="fmb-sp-mobile-header-text">
        <span className="fmb-sp-mobile-header-title">{surveyName || 'FMB Survey'}</span>
        {surveySubtitle && <span className="fmb-sp-mobile-header-sub">{surveySubtitle}</span>}
      </div>
    </div>
    <div className={`fmb-sp-screen${compact ? ' compact' : ''}`} data-testid="sp-phone-screen">
      {children}
    </div>
  </div>
);

const PHASE_LABELS = {
  'user-login':     'User Login',
  'user-verify':    'Verify Details',
  'language-select':'Choose Language',
  'udise-input':    'School UDISE',
  'udise-verified': 'School Verified',
  'survey':         'Survey',
  'completed':      'Completed',
};

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

  const backToQuestions = () => navigate(`/surveys/${surveyId}/questions`);

  // ── Branded header used by every workspace render ───────────────────
  const renderHeader = (overrides = {}) => (
    <PageHeader
      eyebrow={surveyId || undefined}
      title="Survey Preview"
      sub={overrides.sub || (survey?.surveyName ? `Walk through "${survey.surveyName}" exactly as a respondent will see it on mobile.` : 'Walk through the survey exactly as a respondent will see it on mobile.')}
      actions={
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={backToQuestions}
          data-testid="sp-back"
        >
          <Icon name="chevronLeft" /> Back to Questions
        </button>
      }
    />
  );

  // ─── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fmb-sp-page" data-testid="sp-loading">
        {renderHeader({ sub: 'Loading the preview workspace…' })}
        <div className="fmb-sp-shell">
          <div className="fmb-sp-canvas">
            <div className="fmb-sp-skel" style={{ width: 384, maxWidth: '100%', height: 640, borderRadius: 28 }} />
          </div>
          <div className="fmb-sp-skel" style={{ height: 320, borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="fmb-sp-page" data-testid="sp-error">
        {renderHeader({ sub: "We couldn't load this survey's preview." })}
        <div className="fmb-sp-error-banner" role="alert">
          <span className="fmb-sp-error-banner-title">Error: </span>{error}
        </div>
        <div>
          <button type="button" className="btn btn-primary btn-sm" onClick={backToQuestions}>
            Back to Questions
          </button>
        </div>
      </div>
    );
  }

  // ─── Empty (no questions) state ───────────────────────────────────────
  if (!questions || questions.length === 0) {
    return (
      <div className="fmb-sp-page" data-testid="sp-empty">
        {renderHeader({ sub: 'This survey has no questions yet — add some to preview the respondent flow.' })}
        <div className="fmb-sp-empty">
          <div className="fmb-sp-empty-title">No questions to preview</div>
          <p>Add at least one question to this survey before previewing.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={backToQuestions}>
            Back to Questions
          </button>
        </div>
      </div>
    );
  }

  // ─── Common inspector subtree — derives only from current state ───────
  const visibleCount = visibleQuestions.length;
  const answeredCount = visibleQuestions.filter(isAnswered).length;
  const surveyPhaseActive = phase === 'survey';
  const completed = phase === 'completed';
  const progressPct = visibleCount > 0
    ? Math.round((surveyPhaseActive ? (currentQuestionIndex / Math.max(visibleCount - 1, 1)) : (completed ? 1 : 0)) * 100)
    : 0;

  const renderInspector = () => (
    <aside className="fmb-sp-inspector" aria-label="Preview inspector" data-testid="sp-inspector">
      <div className="fmb-sp-insp-section">
        <span className="fmb-sp-insp-label">Phase</span>
        <span className={`fmb-sp-phase-chip${completed ? ' accent' : ''}`} data-testid="sp-phase-chip">
          {PHASE_LABELS[phase] || phase}
        </span>
      </div>

      <hr className="fmb-sp-insp-divider" />

      <div className="fmb-sp-insp-section">
        <span className="fmb-sp-insp-label">Survey</span>
        <div className="fmb-sp-insp-kv">
          <span className="fmb-sp-insp-kv-label">Name</span>
          <span className="fmb-sp-insp-kv-value">{survey?.surveyName || '—'}</span>
        </div>
        <div className="fmb-sp-insp-kv">
          <span className="fmb-sp-insp-kv-label">ID</span>
          <span className="fmb-sp-insp-kv-value mono">{survey?.surveyId || surveyId}</span>
        </div>
        <div className="fmb-sp-insp-kv">
          <span className="fmb-sp-insp-kv-label">Languages</span>
          <span className="fmb-sp-insp-tags">
            {availableLanguages.map(l => (
              <Chip key={l} variant={l === effectiveLanguage ? 'brand' : ''}>{l}</Chip>
            ))}
          </span>
        </div>
        <div className="fmb-sp-insp-kv">
          <span className="fmb-sp-insp-kv-label">In school</span>
          <span className="fmb-sp-insp-kv-value">{isSchoolSurvey ? 'Yes' : 'No'}</span>
        </div>
      </div>

      {previewUser && (
        <>
          <hr className="fmb-sp-insp-divider" />
          <div className="fmb-sp-insp-section" data-testid="sp-insp-respondent">
            <span className="fmb-sp-insp-label">Respondent</span>
            <div className="fmb-sp-insp-kv">
              <span className="fmb-sp-insp-kv-label">User ID</span>
              <span className="fmb-sp-insp-kv-value mono">{previewUser.userId}</span>
            </div>
            <div className="fmb-sp-insp-kv">
              <span className="fmb-sp-insp-kv-label">Name</span>
              <span className="fmb-sp-insp-kv-value">{previewUser.name}</span>
            </div>
            <div className="fmb-sp-insp-kv">
              <span className="fmb-sp-insp-kv-label">Designation</span>
              <span className="fmb-sp-insp-kv-value">{previewUser.designation}</span>
            </div>
          </div>
        </>
      )}

      {verifiedSchool && (
        <>
          <hr className="fmb-sp-insp-divider" />
          <div className="fmb-sp-insp-section" data-testid="sp-insp-school">
            <span className="fmb-sp-insp-label">School</span>
            <div className="fmb-sp-insp-kv">
              <span className="fmb-sp-insp-kv-label">UDISE</span>
              <span className="fmb-sp-insp-kv-value mono">{verifiedSchool.udiseCode}</span>
            </div>
            <div className="fmb-sp-insp-kv">
              <span className="fmb-sp-insp-kv-label">Name</span>
              <span className="fmb-sp-insp-kv-value">{verifiedSchool.schoolName}</span>
            </div>
            <div className="fmb-sp-insp-kv">
              <span className="fmb-sp-insp-kv-label">District</span>
              <span className="fmb-sp-insp-kv-value">{verifiedSchool.district}, {verifiedSchool.state}</span>
            </div>
          </div>
        </>
      )}

      {(surveyPhaseActive || completed) && (
        <>
          <hr className="fmb-sp-insp-divider" />
          <div className="fmb-sp-insp-section" data-testid="sp-insp-progress">
            <span className="fmb-sp-insp-label">Progress</span>
            <div className="fmb-sp-progress">
              <div className="fmb-sp-progress-meta">
                <span>
                  {completed
                    ? 'All done'
                    : `Question ${Math.min(currentQuestionIndex + 1, visibleCount)} of ${visibleCount}`}
                </span>
                <span data-testid="sp-progress-answered">{answeredCount}/{visibleCount} answered</span>
              </div>
              <div className="fmb-sp-progress-track">
                <div
                  className="fmb-sp-progress-fill"
                  style={{ width: `${completed ? 100 : progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {surveyPhaseActive && visibleCount > 0 && (
        <>
          <hr className="fmb-sp-insp-divider" />
          <div className="fmb-sp-insp-section" data-testid="sp-insp-navigator">
            <span className="fmb-sp-insp-label">Jump to question</span>
            <div className="fmb-sp-insp-chips" role="list">
              {visibleQuestions.map((q, index) => {
                const cls = index === currentQuestionIndex
                  ? 'fmb-sp-insp-chip active'
                  : isAnswered(q)
                    ? 'fmb-sp-insp-chip answered'
                    : 'fmb-sp-insp-chip';
                return (
                  <button
                    key={q.questionId}
                    type="button"
                    className={cls}
                    onClick={() => handleNavigate(index)}
                    aria-current={index === currentQuestionIndex ? 'true' : undefined}
                  >
                    {q.questionId}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </aside>
  );

  // ─── Per-phase canvas content (inside the phone frame) ────────────────
  const renderPhoneContent = () => {
    if (phase === 'user-login') {
      return (
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
      );
    }

    if (phase === 'user-verify' && previewUser) {
      return (
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
      );
    }

    if (phase === 'language-select') {
      return (
        <div className="preview-modal" role="dialog" aria-modal="false">
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
      );
    }

    if (phase === 'udise-input') {
      return (
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
      );
    }

    if (phase === 'udise-verified' && verifiedSchool) {
      return (
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
      );
    }

    if (phase === 'completed') {
      return (
        <div className="preview-completed-card" data-testid="sp-completed-card">
          <div className="preview-completed-checkmark">✓</div>
          <h2 className="preview-completed-title">Survey Completed</h2>
          <p className="preview-completed-desc">
            You have successfully completed the preview of <strong>{survey?.surveyName}</strong>.
          </p>
          <div className="preview-completed-actions">
            <button
              className="btn btn-primary"
              onClick={backToQuestions}
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
      );
    }

    // phase === 'survey'
    const currentQuestion = visibleQuestions[currentQuestionIndex];
    return (
      <>
        {validationError && (
          <div className="fmb-sp-validation" role="alert" data-testid="sp-validation">
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
            type="button"
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
            type="button"
            className="btn btn-primary preview-save-continue-btn"
            onClick={handleSubmitCurrent}
            data-testid="sp-save-continue"
          >
            {currentQuestionIndex < visibleQuestions.length - 1 ? 'Save and Continue' : 'Submit Survey'}
          </button>
        </div>
      </>
    );
  };

  const surveySubtitle = previewUser
    ? `${previewUser.name} · ${previewUser.designation}`
    : (effectiveLanguage !== 'English' ? effectiveLanguage : null);

  return (
    <div className="fmb-sp-page" data-testid="sp-page">
      {renderHeader()}
      <div className="fmb-sp-shell">
        <div className="fmb-sp-canvas">
          <PhoneFrame
            surveyName={survey?.surveyName || 'FMB Survey'}
            surveySubtitle={surveySubtitle}
            compact={phase === 'survey'}
          >
            {renderPhoneContent()}
          </PhoneFrame>
        </div>
        {renderInspector()}
      </div>
    </div>
  );
};

export default SurveyPreview;
