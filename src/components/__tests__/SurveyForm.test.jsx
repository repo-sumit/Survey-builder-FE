/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../Toast';

/**
 * The data layer is mocked so we can drive every branch (create / edit /
 * loading / load-error / validation / submit / payload shape) without a
 * real backend. designationAPI is mocked to a small set of rows — that's
 * the canonical source the form reads from, NOT any hardcoded prototype
 * array.
 */
jest.mock('../../services/api', () => ({
  __esModule: true,
  surveyAPI: {
    getById: jest.fn(),
    create:  jest.fn(),
    update:  jest.fn(),
  },
  designationAPI: {
    getAll:        jest.fn(),
    seedDefaults:  jest.fn(),
  }
}));

const mockNavigate = jest.fn();
const mockParams = { current: {} };
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams.current,
  };
});

const { surveyAPI, designationAPI } = require('../../services/api');
// Import AFTER mocks so module-scope imports pick up the doubles.
const SurveyForm = require('../SurveyForm').default;

const renderForm = (paramOverride = {}) => {
  mockParams.current = paramOverride;
  return render(
    <ToastProvider>
      <MemoryRouter>
        <SurveyForm />
      </MemoryRouter>
    </ToastProvider>
  );
};

const designationsFixture = [
  { state_code: 'GJ', designation_id: 1,  hierarchy_level: 1,  designation_name: 'State Project Director', medium_in_english: 'English' },
  { state_code: 'GJ', designation_id: 5,  hierarchy_level: 5,  designation_name: 'School Head',            medium_in_english: 'English' },
  { state_code: 'GJ', designation_id: 99, hierarchy_level: 99, designation_name: 'Test',                   medium_in_english: 'English' },
];

const existingSurvey = {
  surveyId: 'GJ_HEAD_ANNUAL',
  surveyName: 'Annual Head-of-School Assessment',
  surveyDescription: 'Year-end leadership review.',
  availableMediums: 'English,Gujarati',
  hierarchicalAccessLevel: '5,99',
  public: 'Yes',
  inSchool: 'Yes',
  acceptMultipleEntries: 'No',
  launchDate: '01/07/2026 00:00:00',
  closeDate:  '15/08/2026 23:59:59',
  mode: 'New Data',
  visibleOnReportBot: 'No',
  isActive: 'Yes',
  downloadResponse: 'Yes',
  geoFencing: 'No',
  geoTagging: 'No',
  testSurvey: 'No',
};

beforeEach(() => {
  jest.clearAllMocks();
  designationAPI.getAll.mockResolvedValue(designationsFixture);
  designationAPI.seedDefaults.mockResolvedValue({});
});

describe('SurveyForm — create mode', () => {
  test('renders the Create page header + empty form', async () => {
    renderForm();
    await waitFor(() => expect(designationAPI.getAll).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: /Create survey/i })).toBeInTheDocument();
    expect(screen.getByTestId('surveyform-survey-id')).toHaveValue('');
    expect(screen.getByTestId('surveyform-survey-name')).toHaveValue('');
    expect(screen.getByTestId('surveyform-submit')).toBeDisabled();
  });

  test('Cancel + Back-to-Surveys navigate to /', async () => {
    const user = userEvent.setup();
    renderForm();
    await waitFor(() => expect(designationAPI.getAll).toHaveBeenCalled());
    await user.click(screen.getByTestId('surveyform-cancel'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
    await user.click(screen.getByTestId('surveyform-back'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
  });

  test('submit is gated until ID + name + description + at least one language are present', async () => {
    const user = userEvent.setup();
    renderForm();
    await waitFor(() => expect(designationAPI.getAll).toHaveBeenCalled());
    const submit = screen.getByTestId('surveyform-submit');
    expect(submit).toBeDisabled();

    await user.type(screen.getByTestId('surveyform-survey-id'), 'GJ_HEAD_TEST');
    await user.type(screen.getByTestId('surveyform-survey-name'), 'Head Test');
    await user.type(screen.getByTestId('surveyform-survey-description'), 'Quick test description.');
    // Still disabled — no language selected
    expect(submit).toBeDisabled();

    // Pick a language
    await user.click(screen.getByTestId('surveyform-languages-trigger'));
    await user.click(await screen.findByRole('option', { name: /English/i }));
    expect(submit).not.toBeDisabled();
  });

  test('successful create calls surveyAPI.create with the canonical payload shape', async () => {
    const user = userEvent.setup();
    surveyAPI.create.mockResolvedValue({ surveyId: 'GJ_NEW' });
    renderForm();
    await waitFor(() => expect(designationAPI.getAll).toHaveBeenCalled());

    await user.type(screen.getByTestId('surveyform-survey-id'), 'GJ_NEW');
    await user.type(screen.getByTestId('surveyform-survey-name'), 'New survey');
    await user.type(screen.getByTestId('surveyform-survey-description'), 'New description.');

    await user.click(screen.getByTestId('surveyform-languages-trigger'));
    await user.click(await screen.findByRole('option', { name: /^English$/ }));
    await user.click(screen.getByRole('option', { name: /^Hindi$/ }));

    await user.click(screen.getByTestId('surveyform-submit'));
    await waitFor(() => expect(surveyAPI.create).toHaveBeenCalledTimes(1));

    const payload = surveyAPI.create.mock.calls[0][0];
    expect(payload.surveyId).toBe('GJ_NEW');
    expect(payload.surveyName).toBe('New survey');
    expect(payload.surveyDescription).toBe('New description.');
    // Payload contract: comma-separated string, not array
    expect(payload.availableMediums).toBe('English,Hindi');
    // hierarchicalAccessLevel always includes level 99 even with no manual picks
    expect(payload.hierarchicalAccessLevel.split(',')).toContain('99');
    // Yes/No string contract preserved
    expect(payload.public).toBe('Yes');
    expect(payload.isActive).toBe('Yes');

    expect(mockNavigate).toHaveBeenLastCalledWith('/surveys/GJ_NEW/questions');
  });

  test('submit button shows "Creating…" + aria-busy while saving', async () => {
    const user = userEvent.setup();
    let resolveCreate;
    surveyAPI.create.mockImplementation(() => new Promise((r) => { resolveCreate = r; }));
    renderForm();
    await waitFor(() => expect(designationAPI.getAll).toHaveBeenCalled());

    await user.type(screen.getByTestId('surveyform-survey-id'), 'X');
    await user.type(screen.getByTestId('surveyform-survey-name'), 'X');
    await user.type(screen.getByTestId('surveyform-survey-description'), 'X');
    await user.click(screen.getByTestId('surveyform-languages-trigger'));
    await user.click(await screen.findByRole('option', { name: /^English$/ }));
    await user.click(screen.getByTestId('surveyform-submit'));

    const submit = screen.getByTestId('surveyform-submit');
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit.textContent).toMatch(/Creating/i);
    expect(submit).toHaveAttribute('aria-busy', 'true');
    await act(async () => { resolveCreate({ surveyId: 'X' }); });
  });

  test('backend error response surfaces in the error summary banner', async () => {
    const user = userEvent.setup();
    surveyAPI.create.mockRejectedValue({
      response: { data: { errors: ['Survey ID is invalid: bad format'] } }
    });
    renderForm();
    await waitFor(() => expect(designationAPI.getAll).toHaveBeenCalled());

    await user.type(screen.getByTestId('surveyform-survey-id'), 'BAD_ID');
    await user.type(screen.getByTestId('surveyform-survey-name'), 'N');
    await user.type(screen.getByTestId('surveyform-survey-description'), 'D');
    await user.click(screen.getByTestId('surveyform-languages-trigger'));
    await user.click(await screen.findByRole('option', { name: /^English$/ }));
    await user.click(screen.getByTestId('surveyform-submit'));

    const banner = await screen.findByTestId('surveyform-error-summary');
    expect(banner).toHaveTextContent(/Survey ID is invalid/i);
    expect(mockNavigate).not.toHaveBeenLastCalledWith('/');
  });
});

describe('SurveyForm — edit mode', () => {
  test('shows skeleton while fetching the survey', async () => {
    let resolveGet;
    surveyAPI.getById.mockImplementation(() => new Promise((r) => { resolveGet = r; }));
    renderForm({ surveyId: 'GJ_HEAD_ANNUAL' });
    expect(screen.getByTestId('surveyform-loading')).toBeInTheDocument();
    await act(async () => { resolveGet(existingSurvey); });
    await waitFor(() => expect(screen.queryByTestId('surveyform-loading')).not.toBeInTheDocument());
  });

  test('populates fields from surveyAPI.getById; ID is locked', async () => {
    surveyAPI.getById.mockResolvedValue(existingSurvey);
    renderForm({ surveyId: 'GJ_HEAD_ANNUAL' });

    await screen.findByText(/Edit survey/i);
    await waitFor(() => expect(screen.getByTestId('surveyform-survey-name')).toHaveValue('Annual Head-of-School Assessment'));
    expect(screen.getByTestId('surveyform-survey-id')).toHaveValue('GJ_HEAD_ANNUAL');
    expect(screen.getByTestId('surveyform-survey-id')).toBeDisabled(); // ID can't be edited
    expect(screen.getByTestId('surveyform-survey-description')).toHaveValue('Year-end leadership review.');
    // availableMediums string → split into chips
    const tags = screen.getByTestId('surveyform-language-tags');
    expect(tags).toHaveTextContent('English');
    expect(tags).toHaveTextContent('Gujarati');
  });

  test('successful update calls surveyAPI.update(:id, payload) then navigates to /', async () => {
    const user = userEvent.setup();
    surveyAPI.getById.mockResolvedValue(existingSurvey);
    surveyAPI.update.mockResolvedValue({});
    renderForm({ surveyId: 'GJ_HEAD_ANNUAL' });

    await waitFor(() => expect(screen.getByTestId('surveyform-survey-name')).toHaveValue('Annual Head-of-School Assessment'));
    // Submit must say "Save changes" in edit mode
    const submit = screen.getByTestId('surveyform-submit');
    expect(submit.textContent).toMatch(/Save changes/i);

    await user.click(submit);
    await waitFor(() => expect(surveyAPI.update).toHaveBeenCalledTimes(1));
    expect(surveyAPI.update.mock.calls[0][0]).toBe('GJ_HEAD_ANNUAL');
    const payload = surveyAPI.update.mock.calls[0][1];
    expect(payload.surveyId).toBe('GJ_HEAD_ANNUAL');
    expect(payload.availableMediums).toBe('English,Gujarati');
    expect(payload.hierarchicalAccessLevel.split(',')).toContain('99');
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
  });

  test('load failure renders the error state with a Back action', async () => {
    surveyAPI.getById.mockRejectedValue(new Error('boom'));
    renderForm({ surveyId: 'BAD_ID' });
    await screen.findByTestId('surveyform-load-error');
    expect(screen.getByText(/couldn't load this survey/i)).toBeInTheDocument();
  });
});

describe('SurveyForm — designation integration (no hardcoded values)', () => {
  test('hierarchy dropdown is populated from the real designationAPI mock', async () => {
    const user = userEvent.setup();
    renderForm();
    await waitFor(() => expect(designationAPI.getAll).toHaveBeenCalled());

    await user.click(screen.getByTestId('surveyform-hierarchy-trigger'));
    expect(await screen.findByText(/State Project Director/i)).toBeInTheDocument();
    expect(screen.getByText(/School Head/i)).toBeInTheDocument();
    // The level-99 row from our fixture is present and locked
    expect(screen.getAllByText(/^99 — /i).length).toBeGreaterThan(0);
  });

  test('selecting a level adds it to the tags AND keeps level 99 auto-included', async () => {
    const user = userEvent.setup();
    renderForm();
    await waitFor(() => expect(designationAPI.getAll).toHaveBeenCalled());

    await user.click(screen.getByTestId('surveyform-hierarchy-trigger'));
    await user.click(await screen.findByText(/School Head/i));

    const tags = screen.getByTestId('surveyform-hierarchy-tags');
    expect(tags).toHaveTextContent('5');
    expect(tags).toHaveTextContent('99');
  });

  test('if no level-99 row is returned by designationAPI, seedDefaults is silently invoked', async () => {
    designationAPI.getAll.mockResolvedValueOnce([
      { state_code: 'GJ', designation_id: 1, hierarchy_level: 1, designation_name: 'X', medium_in_english: 'English' }
    ]);
    renderForm();
    await waitFor(() => expect(designationAPI.seedDefaults).toHaveBeenCalledTimes(1));
  });
});
