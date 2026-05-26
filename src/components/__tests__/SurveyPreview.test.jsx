/* eslint-env jest */
import React from 'react';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Phase 9 — Survey Preview redesign tests.
 *
 * These tests pin the redesigned shell's CONTRACTS, not the visual
 * details: PageHeader, two-column shell, phone frame, inspector
 * sections, phase chip, progress, and the chip jumper. The legacy
 * state machine + handlers are exercised end-to-end to lock in:
 *   - loading / error / empty states
 *   - user-login → user-verify → language-select → udise-input
 *     → udise-verified → survey → completed flow
 *   - mandatory-answer validation
 *   - completion state
 *   - back-to-questions navigation
 *
 * No real API; surveyAPI + questionAPI are mocked. react-router-dom's
 * useParams + useNavigate are mocked so the route param can vary
 * across tests and we can assert on the navigate target.
 */

jest.mock('../../services/api', () => ({
  __esModule: true,
  surveyAPI:   { getById: jest.fn() },
  questionAPI: { getAll: jest.fn() },
}));

const mockNavigate = jest.fn();
const mockParams = { current: { surveyId: 'GJ_HEAD_ANNUAL' } };
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams.current,
  };
});

const { surveyAPI, questionAPI } = require('../../services/api');
const SurveyPreview = require('../preview/SurveyPreview').default;

/* ── Fixtures ─────────────────────────────────────────────────── */

const SURVEY_MULTILINGUAL_SCHOOL = {
  surveyId: 'GJ_HEAD_ANNUAL',
  surveyName: 'Annual Head-of-School Assessment — Gujarat',
  surveyDescription: 'Year-end leadership review.',
  availableMediums: 'English,Hindi,Gujarati',
  inSchool: 'Yes',
};

const SURVEY_ENGLISH_ONLY_NON_SCHOOL = {
  surveyId: 'EN_ONLY',
  surveyName: 'English-only Quick Pulse',
  availableMediums: 'English',
  inSchool: 'No',
};

const SIMPLE_QUESTIONS = [
  {
    questionId: 'Q1',
    questionType: 'Text Response',
    questionDescription: 'What is your role?',
    isMandatory: 'No',
    options: [],
  },
  {
    questionId: 'Q2',
    questionType: 'Multiple Choice Single Select',
    questionDescription: 'Pick a medium',
    isMandatory: 'Yes',
    options: [{ text: 'English' }, { text: 'Hindi' }],
  },
];

/* ── Render helper ───────────────────────────────────────────── */

const renderPreview = (params = { surveyId: 'GJ_HEAD_ANNUAL' }) => {
  mockParams.current = params;
  return render(
    <MemoryRouter>
      <SurveyPreview />
    </MemoryRouter>
  );
};

const settleLoading = () => waitFor(() =>
  expect(screen.queryByTestId('sp-loading')).not.toBeInTheDocument()
);

beforeEach(() => {
  jest.clearAllMocks();
});

/* ════════════════════════════════════════════════════════════
   1. Shell, header, and state-screen contracts
   ════════════════════════════════════════════════════════════ */
describe('SurveyPreview — shell + state screens', () => {
  test('loading state renders branded skeleton + PageHeader', async () => {
    surveyAPI.getById.mockImplementation(() => new Promise(() => {}));
    questionAPI.getAll.mockImplementation(() => new Promise(() => {}));
    renderPreview();

    expect(await screen.findByTestId('sp-loading')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Survey Preview/i })).toBeInTheDocument();
    // The eyebrow surfaces the survey ID even before the survey loads.
    expect(screen.getByText('GJ_HEAD_ANNUAL')).toBeInTheDocument();
  });

  test('error state renders alert banner + Back to Questions', async () => {
    surveyAPI.getById.mockRejectedValue(new Error('network fail'));
    questionAPI.getAll.mockRejectedValue(new Error('also dead'));
    renderPreview();

    const errorBox = await screen.findByTestId('sp-error');
    expect(screen.getByRole('alert')).toHaveTextContent(/Failed to load survey data/i);
    // Two Back-to-Questions buttons render (PageHeader + inline); the inline
    // one is the explicit recovery action under the banner.
    const allBacks = within(errorBox).getAllByRole('button', { name: /Back to Questions/i });
    await userEvent.click(allBacks[allBacks.length - 1]);
    expect(mockNavigate).toHaveBeenLastCalledWith('/surveys/GJ_HEAD_ANNUAL/questions');
  });

  test('empty state renders when survey has no questions', async () => {
    surveyAPI.getById.mockResolvedValue(SURVEY_ENGLISH_ONLY_NON_SCHOOL);
    questionAPI.getAll.mockResolvedValue([]);
    renderPreview({ surveyId: 'EN_ONLY' });

    await screen.findByTestId('sp-empty');
    expect(screen.getByText(/No questions to preview/i)).toBeInTheDocument();
  });

  test('Back to Questions action in the header navigates to the question list', async () => {
    surveyAPI.getById.mockResolvedValue(SURVEY_ENGLISH_ONLY_NON_SCHOOL);
    questionAPI.getAll.mockResolvedValue(SIMPLE_QUESTIONS);
    renderPreview({ surveyId: 'EN_ONLY' });

    await settleLoading();
    await userEvent.click(screen.getByTestId('sp-back'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/surveys/EN_ONLY/questions');
  });
});

/* ════════════════════════════════════════════════════════════
   2. Onboarding state machine
   ════════════════════════════════════════════════════════════ */
describe('SurveyPreview — onboarding flow', () => {
  test('multilingual + school survey: user-login → user-verify → language-select → udise-input → udise-verified → survey', async () => {
    surveyAPI.getById.mockResolvedValue(SURVEY_MULTILINGUAL_SCHOOL);
    questionAPI.getAll.mockResolvedValue(SIMPLE_QUESTIONS);
    renderPreview();
    await settleLoading();

    const phaseChip = () => screen.getByTestId('sp-phase-chip');

    // Phase 1: user-login
    expect(phaseChip()).toHaveTextContent(/User Login/i);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/User ID/i), '1001');
    await user.click(screen.getByRole('button', { name: /^Continue$/ }));

    // Phase 2: user-verify
    await waitFor(() => expect(phaseChip()).toHaveTextContent(/Verify Details/i));
    // The previewUser name appears in both the phone-frame verify card AND
    // the inspector — assert at least one is present, then scope to the
    // inspector for the exact respondent block.
    expect(screen.getAllByText(/Test User 1/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('sp-insp-respondent')).toHaveTextContent('1001');
    await user.click(screen.getByRole('button', { name: /Continue & Sign In/i }));

    // Phase 3: language-select (multilingual survey)
    await waitFor(() => expect(phaseChip()).toHaveTextContent(/Choose Language/i));
    expect(screen.getByLabelText(/Language/i)).toHaveValue('English');
    await user.selectOptions(screen.getByLabelText(/Language/i), 'Hindi');
    await user.click(screen.getByRole('button', { name: /^Continue$/ }));

    // Phase 4: udise-input (school survey)
    await waitFor(() => expect(phaseChip()).toHaveTextContent(/School UDISE/i));
    await user.type(screen.getByLabelText(/UDISE Code/i), '12345678901');
    await user.click(screen.getByRole('button', { name: /Validate UDISE/i }));

    // Phase 5: udise-verified
    await waitFor(() => expect(phaseChip()).toHaveTextContent(/School Verified/i));
    expect(screen.getByTestId('sp-insp-school')).toHaveTextContent('12345678901');
    await user.click(screen.getByRole('button', { name: /Proceed to Survey/i }));

    // Phase 6: survey
    await waitFor(() => expect(phaseChip()).toHaveTextContent(/^Survey/));
    // First visible question rendered
    expect(screen.getByText(/What is your role/i)).toBeInTheDocument();
  });

  test('english-only + non-school survey: skips language-select and udise-input', async () => {
    surveyAPI.getById.mockResolvedValue(SURVEY_ENGLISH_ONLY_NON_SCHOOL);
    questionAPI.getAll.mockResolvedValue(SIMPLE_QUESTIONS);
    renderPreview({ surveyId: 'EN_ONLY' });
    await settleLoading();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/User ID/i), '1002');
    await user.click(screen.getByRole('button', { name: /^Continue$/ }));
    await user.click(screen.getByRole('button', { name: /Continue & Sign In/i }));

    // Should jump straight to survey
    await waitFor(() => expect(screen.getByTestId('sp-phase-chip')).toHaveTextContent(/^Survey/));
    expect(screen.getByText(/What is your role/i)).toBeInTheDocument();
  });

  test('rejects non-numeric and unknown user IDs at the login phase', async () => {
    surveyAPI.getById.mockResolvedValue(SURVEY_ENGLISH_ONLY_NON_SCHOOL);
    questionAPI.getAll.mockResolvedValue(SIMPLE_QUESTIONS);
    renderPreview({ surveyId: 'EN_ONLY' });
    await settleLoading();

    const user = userEvent.setup();
    // empty submit → required
    await user.click(screen.getByRole('button', { name: /^Continue$/ }));
    expect(screen.getByText(/User ID is required/)).toBeInTheDocument();

    // unknown user id (input is digit-filtered, so "abc" becomes "")
    await user.type(screen.getByLabelText(/User ID/i), '9999');
    await user.click(screen.getByRole('button', { name: /^Continue$/ }));
    expect(screen.getByText(/User ID not found/)).toBeInTheDocument();
  });

  test('rejects empty UDISE code at the udise-input phase', async () => {
    surveyAPI.getById.mockResolvedValue(SURVEY_MULTILINGUAL_SCHOOL);
    questionAPI.getAll.mockResolvedValue(SIMPLE_QUESTIONS);
    renderPreview();
    await settleLoading();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/User ID/i), '1003');
    await user.click(screen.getByRole('button', { name: /^Continue$/ }));
    await user.click(screen.getByRole('button', { name: /Continue & Sign In/i }));
    await user.click(screen.getByRole('button', { name: /^Continue$/ })); // language-select default English

    await user.click(screen.getByRole('button', { name: /Validate UDISE/i }));
    expect(screen.getByText(/UDISE Code is required/)).toBeInTheDocument();
  });
});

/* ════════════════════════════════════════════════════════════
   3. Survey phase: question render, navigation, validation,
      completion, and inspector derivations
   ════════════════════════════════════════════════════════════ */
describe('SurveyPreview — survey phase', () => {
  const reachSurvey = async () => {
    surveyAPI.getById.mockResolvedValue(SURVEY_ENGLISH_ONLY_NON_SCHOOL);
    questionAPI.getAll.mockResolvedValue(SIMPLE_QUESTIONS);
    renderPreview({ surveyId: 'EN_ONLY' });
    await settleLoading();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/User ID/i), '1001');
    await user.click(screen.getByRole('button', { name: /^Continue$/ }));
    await user.click(screen.getByRole('button', { name: /Continue & Sign In/i }));
    await waitFor(() => expect(screen.getByTestId('sp-phase-chip')).toHaveTextContent(/^Survey/));
    return user;
  };

  test('renders Question 1 first and the chip jumper exposes Q1 + Q2', async () => {
    await reachSurvey();

    expect(screen.getByText(/What is your role/i)).toBeInTheDocument();
    const navigator = screen.getByTestId('sp-insp-navigator');
    expect(within(navigator).getByRole('button', { name: 'Q1' })).toBeInTheDocument();
    expect(within(navigator).getByRole('button', { name: 'Q2' })).toBeInTheDocument();
    // Q1 chip has aria-current=true; Q2 chip does not.
    expect(within(navigator).getByRole('button', { name: 'Q1' })).toHaveAttribute('aria-current', 'true');
  });

  test('Save and Continue advances to next question; chip aria-current follows', async () => {
    const user = await reachSurvey();

    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));

    expect(screen.getByText(/Pick a medium/i)).toBeInTheDocument();
    const navigator = screen.getByTestId('sp-insp-navigator');
    expect(within(navigator).getByRole('button', { name: 'Q2' })).toHaveAttribute('aria-current', 'true');
  });

  test('mandatory unanswered question blocks Save and Continue with a validation banner', async () => {
    const user = await reachSurvey();

    // Q1 is non-mandatory; advance to Q2 which IS mandatory
    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));

    // Submit Q2 without answering → validation banner
    await user.click(screen.getByRole('button', { name: /Submit Survey/i }));
    expect(screen.getByTestId('sp-validation')).toHaveTextContent(/Please answer this question/);
    expect(screen.getByTestId('sp-phase-chip')).toHaveTextContent(/^Survey/);
  });

  test('Previous button returns to earlier question', async () => {
    const user = await reachSurvey();

    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));
    expect(screen.getByText(/Pick a medium/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Previous/i }));
    expect(screen.getByText(/What is your role/i)).toBeInTheDocument();
  });

  test('inspector chip jumper navigates directly to a question', async () => {
    const user = await reachSurvey();

    const navigator = screen.getByTestId('sp-insp-navigator');
    await user.click(within(navigator).getByRole('button', { name: 'Q2' }));
    expect(screen.getByText(/Pick a medium/i)).toBeInTheDocument();
  });

  test('completing the last question (answered) moves to completion state', async () => {
    const user = await reachSurvey();

    // Q1 → Q2
    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));
    // MCSS renderer uses pill buttons (not native radios) — pick the
    // first option by its accessible name.
    await user.click(screen.getByRole('button', { name: 'English' }));
    // Submit
    await user.click(screen.getByRole('button', { name: /Submit Survey/i }));

    await waitFor(() => expect(screen.getByTestId('sp-phase-chip')).toHaveTextContent(/Completed/i));
    expect(screen.getByTestId('sp-completed-card')).toBeInTheDocument();
    expect(screen.getByText(/Survey Completed/i)).toBeInTheDocument();
  });

  test('progress meta + bar derive only from current state', async () => {
    const user = await reachSurvey();

    // Initial: Q1 of 2, 0 answered
    const inspector = screen.getByTestId('sp-inspector');
    expect(within(inspector).getByText(/Question 1 of 2/)).toBeInTheDocument();
    expect(screen.getByTestId('sp-progress-answered')).toHaveTextContent('0/2 answered');

    // Advance to Q2 → meta updates
    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));
    expect(within(inspector).getByText(/Question 2 of 2/)).toBeInTheDocument();
  });
});

/* ════════════════════════════════════════════════════════════
   4. Phone frame contract
   ════════════════════════════════════════════════════════════ */
describe('SurveyPreview — phone frame chrome', () => {
  test('phone frame renders the survey name inside its mobile header', async () => {
    surveyAPI.getById.mockResolvedValue(SURVEY_ENGLISH_ONLY_NON_SCHOOL);
    questionAPI.getAll.mockResolvedValue(SIMPLE_QUESTIONS);
    renderPreview({ surveyId: 'EN_ONLY' });
    await settleLoading();

    const phone = screen.getByTestId('sp-phone-frame');
    expect(within(phone).getByText('English-only Quick Pulse')).toBeInTheDocument();
    // The screen container is scrollable
    expect(within(phone).getByTestId('sp-phone-screen')).toBeInTheDocument();
  });
});

/* ════════════════════════════════════════════════════════════
   5. Completion state — restart resets onboarding
   ════════════════════════════════════════════════════════════ */
describe('SurveyPreview — completion state', () => {
  test('Restart Preview resets to user-login phase with fresh state', async () => {
    surveyAPI.getById.mockResolvedValue(SURVEY_ENGLISH_ONLY_NON_SCHOOL);
    questionAPI.getAll.mockResolvedValue([SIMPLE_QUESTIONS[0]]); // single non-mandatory question
    renderPreview({ surveyId: 'EN_ONLY' });
    await settleLoading();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/User ID/i), '1001');
    await user.click(screen.getByRole('button', { name: /^Continue$/ }));
    await user.click(screen.getByRole('button', { name: /Continue & Sign In/i }));
    await waitFor(() => expect(screen.getByTestId('sp-phase-chip')).toHaveTextContent(/^Survey/));
    // Q1 is non-mandatory; submit immediately
    await user.click(screen.getByRole('button', { name: /Submit Survey/i }));

    await waitFor(() => expect(screen.getByTestId('sp-phase-chip')).toHaveTextContent(/Completed/i));

    await user.click(screen.getByRole('button', { name: /Restart Preview/i }));
    await waitFor(() => expect(screen.getByTestId('sp-phase-chip')).toHaveTextContent(/User Login/i));
    expect(screen.getByLabelText(/User ID/i)).toHaveValue('');
    expect(screen.queryByTestId('sp-insp-respondent')).not.toBeInTheDocument();
  });
});
