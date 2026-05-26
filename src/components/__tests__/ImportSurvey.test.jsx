/* eslint-env jest */
import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Phase 10 — ImportSurvey redesign tests.
 *
 * Pins the redesigned shell + every preserved behavior contract:
 *   - File selection (valid/invalid/oversize)
 *   - Preview flow (success / validation errors / generic error)
 *   - Survey picker toggle + selectedHaveErrors gate
 *   - Commit flow (success → navigate; validation errors; generic error)
 *   - Clear/Reset
 *   - CSV download
 *
 * axios + Toast + useNavigate are all mocked. The component's own
 * formatError / buildErrorCsv / downloadBlob remain real so we are
 * exercising the actual production code paths end-to-end.
 */

jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../Toast', () => ({
  __esModule: true,
  useToast: () => mockToast,
}));

// Replace the WaterAnimation with a stub so we don't render the fish loop.
jest.mock('../WaterAnimation', () => ({
  __esModule: true,
  default: ({ active }) => (active ? <div data-testid="water" /> : null),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Required so `Blob` and `URL.createObjectURL` exist in jsdom.
beforeAll(() => {
  if (!global.URL.createObjectURL) {
    global.URL.createObjectURL = jest.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = jest.fn();
  }
});

const axios = require('axios').default;
const ImportSurvey = require('../ImportSurvey').default;

const renderImport = () => render(
  <MemoryRouter>
    <ImportSurvey />
  </MemoryRouter>
);

const makeFile = (name = 'sample.xlsx', size = 1024) => {
  // Build a real File with a controllable size. The browser's File API
  // returns the size of the provided Blob content; pad with zeros.
  const content = new Array(size).fill('a').join('');
  return new File([content], name, { type: 'application/octet-stream' });
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ════════════════════════════════════════════════════════════ */
describe('ImportSurvey — initial render', () => {
  test('renders PageHeader, stepper, instructions, upload section', () => {
    renderImport();
    expect(screen.getByRole('heading', { name: /Import survey/i })).toBeInTheDocument();
    expect(screen.getByTestId('import-steps')).toBeInTheDocument();
    expect(screen.getByText(/How import works/i)).toBeInTheDocument();
    expect(screen.getByTestId('import-dropzone')).toBeInTheDocument();
    // Preview button is disabled until a file is selected
    expect(screen.getByTestId('import-preview')).toBeDisabled();
  });

  test('Back to Surveys navigates to /', async () => {
    const user = userEvent.setup();
    renderImport();
    await user.click(screen.getByTestId('import-back'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('ImportSurvey — file selection', () => {
  test('selecting an XLSX shows the file pill and enables Preview', async () => {
    const user = userEvent.setup();
    renderImport();
    const input = screen.getByTestId('import-file-input');
    await user.upload(input, makeFile('survey.xlsx', 512));
    expect(screen.getByTestId('import-file-pill')).toHaveTextContent('survey.xlsx');
    expect(screen.getByTestId('import-preview')).not.toBeDisabled();
  });

  test('rejects unsupported file extension with a toast error', async () => {
    renderImport();
    const input = screen.getByTestId('import-file-input');
    // userEvent.upload respects the input's accept attribute, which would
    // reject .pdf before the handler ever runs. Use fireEvent.change
    // directly so we exercise the component's own format check.
    const badFile = new File(['nope'], 'wrong.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [badFile] } });
    expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/XLSX or CSV/i));
    expect(screen.queryByTestId('import-file-pill')).not.toBeInTheDocument();
  });

  test('oversize file (>10 MB) surfaces the inline error card', async () => {
    const user = userEvent.setup();
    renderImport();
    // Stub File.size since making an 11 MB string is wasteful in jsdom.
    const big = makeFile('big.xlsx', 16);
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    await user.upload(screen.getByTestId('import-file-input'), big);
    const card = await screen.findByTestId('import-error-card');
    expect(card).toHaveTextContent(/File is too large/i);
    expect(screen.queryByTestId('import-file-pill')).not.toBeInTheDocument();
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('ImportSurvey — preview flow', () => {
  test('successful preview renders summary + survey picker', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        surveys: [
          { surveyId: 'S1', surveyName: 'Survey 1' },
          { surveyId: 'S2', surveyName: 'Survey 2' },
        ],
        questions: [{}, {}, {}],
        validationErrors: [],
      },
    });
    const user = userEvent.setup();
    renderImport();
    await user.upload(screen.getByTestId('import-file-input'), makeFile('s.xlsx'));
    await user.click(screen.getByTestId('import-preview'));

    await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
      '/api/import/preview',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
    ));

    const summary = await screen.findByTestId('import-summary');
    expect(summary).toHaveTextContent(/Surveys/);
    // Two metric tiles render the same value "2" (Surveys, Selected).
    expect(within(summary).getAllByText('2').length).toBeGreaterThanOrEqual(2);

    const picker = screen.getByTestId('import-picker');
    expect(within(picker).getAllByTestId('import-picker-row')).toHaveLength(2);
    // Commit button now visible and not disabled (no errors, 2 selected)
    expect(screen.getByTestId('import-commit')).toBeInTheDocument();
    expect(screen.getByTestId('import-commit')).not.toBeDisabled();
  });

  test('preview with validation errors renders the errors table + filter chips', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        surveys: [{ surveyId: 'S1', surveyName: 'S1' }],
        questions: [],
        validationErrors: [
          { surveyId: 'S1', type: 'survey',   index: 2,  errors: ['Missing surveyName'] },
          { surveyId: 'S1', type: 'question', index: 5,  questionId: 'Q3', errors: ['Bad option count'] },
        ],
      },
    });
    const user = userEvent.setup();
    renderImport();
    await user.upload(screen.getByTestId('import-file-input'), makeFile('s.xlsx'));
    await user.click(screen.getByTestId('import-preview'));

    const errorsTable = await screen.findByTestId('import-errors-table');
    expect(within(errorsTable).getByText(/Missing surveyName/i)).toBeInTheDocument();
    expect(within(errorsTable).getByText(/Bad option count/i)).toBeInTheDocument();

    // Filter by survey-only
    await user.click(screen.getByTestId('import-filter-survey'));
    expect(within(errorsTable).getByText(/Missing surveyName/i)).toBeInTheDocument();
    expect(within(errorsTable).queryByText(/Bad option count/i)).not.toBeInTheDocument();

    // Commit must be disabled because the selected survey has errors
    expect(screen.getByTestId('import-commit')).toBeDisabled();
  });

  test('preview API error (no validationErrors) shows the generic error card', async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { error: 'Parse failed', message: 'Bad header row' } },
    });
    const user = userEvent.setup();
    renderImport();
    await user.upload(screen.getByTestId('import-file-input'), makeFile('s.xlsx'));
    await user.click(screen.getByTestId('import-preview'));
    const card = await screen.findByTestId('import-error-card');
    expect(card).toHaveTextContent(/Parse failed/);
    expect(card).toHaveTextContent(/Bad header row/);
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('ImportSurvey — commit flow', () => {
  const setupPreviewed = async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        surveys: [{ surveyId: 'S1', surveyName: 'One' }],
        questions: [{}],
        validationErrors: [],
      },
    });
    const user = userEvent.setup();
    renderImport();
    await user.upload(screen.getByTestId('import-file-input'), makeFile('s.xlsx'));
    await user.click(screen.getByTestId('import-preview'));
    await screen.findByTestId('import-summary');
    return user;
  };

  test('successful commit shows success card and navigates after 1500ms', async () => {
    jest.useFakeTimers();
    try {
      // First mock fires for preview (rendered by setupPreviewed below)
      axios.post.mockReset();
      axios.post
        .mockResolvedValueOnce({ data: { surveys: [{ surveyId: 'S1' }], questions: [], validationErrors: [] } })
        .mockResolvedValueOnce({ data: { surveysImported: 1, questionsImported: 4, surveys: [{ surveyId: 'S1' }] } });

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderImport();
      await user.upload(screen.getByTestId('import-file-input'), makeFile('s.xlsx'));
      await user.click(screen.getByTestId('import-preview'));
      await screen.findByTestId('import-summary');

      await user.click(screen.getByTestId('import-commit'));
      const success = await screen.findByTestId('import-success');
      expect(success).toHaveTextContent(/1 survey/);
      expect(success).toHaveTextContent(/4 question/);

      // Navigate fires after 1500ms
      jest.advanceTimersByTime(1600);
      expect(mockNavigate).toHaveBeenLastCalledWith('/surveys/S1/questions');
    } finally {
      jest.useRealTimers();
    }
  });

  test('commit calls the right endpoint with overwrite + selected IDs', async () => {
    const user = await setupPreviewed();
    axios.post.mockResolvedValueOnce({ data: { surveysImported: 1, questionsImported: 1, surveys: [{ surveyId: 'S1' }] } });
    // Enable overwrite
    await user.click(screen.getByTestId('import-overwrite'));
    await user.click(screen.getByTestId('import-commit'));

    await waitFor(() => expect(axios.post).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/api\/import\?.*overwrite=true.*surveyIds=S1/),
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
    ));
  });

  test('commit returning validationErrors shows errors table (no success card, no navigate)', async () => {
    const user = await setupPreviewed();
    axios.post.mockRejectedValueOnce({
      response: { data: {
        error: 'Validation failed',
        validationErrors: [
          { surveyId: 'S1', type: 'question', index: 7, questionId: 'Q1', errors: ['Bad mandatory'] },
        ],
      } },
    });
    await user.click(screen.getByTestId('import-commit'));
    await screen.findByTestId('import-errors-table');
    expect(screen.queryByTestId('import-success')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenLastCalledWith('/surveys/S1/questions');
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('ImportSurvey — picker + clear + CSV', () => {
  test('Select All / Deselect All toggles selectedIds', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        surveys: [{ surveyId: 'S1' }, { surveyId: 'S2' }, { surveyId: 'S3' }],
        questions: [],
        validationErrors: [],
      },
    });
    const user = userEvent.setup();
    renderImport();
    await user.upload(screen.getByTestId('import-file-input'), makeFile('s.xlsx'));
    await user.click(screen.getByTestId('import-preview'));
    await screen.findByTestId('import-picker');

    // Initially all 3 are selected → button reads "Deselect All"
    expect(screen.getByTestId('import-picker-toggle-all')).toHaveTextContent(/Deselect All/i);
    await user.click(screen.getByTestId('import-picker-toggle-all'));
    expect(screen.getByTestId('import-picker-toggle-all')).toHaveTextContent(/Select All/i);
    expect(screen.getByTestId('import-commit')).toBeDisabled();
  });

  test('Clear resets file + preview + errors state', async () => {
    axios.post.mockResolvedValueOnce({
      data: { surveys: [{ surveyId: 'S1' }], questions: [], validationErrors: [] },
    });
    const user = userEvent.setup();
    renderImport();
    await user.upload(screen.getByTestId('import-file-input'), makeFile('s.xlsx'));
    await user.click(screen.getByTestId('import-preview'));
    await screen.findByTestId('import-summary');

    await user.click(screen.getByTestId('import-clear'));
    expect(screen.queryByTestId('import-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('import-file-pill')).not.toBeInTheDocument();
  });

  test('Download CSV calls URL.createObjectURL with a CSV blob (when errors exist)', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        surveys: [{ surveyId: 'S1' }],
        questions: [],
        validationErrors: [
          { surveyId: 'S1', type: 'question', index: 7, questionId: 'Q1', errors: ['Bad option'] },
        ],
      },
    });
    const user = userEvent.setup();
    renderImport();
    await user.upload(screen.getByTestId('import-file-input'), makeFile('errors.xlsx'));
    await user.click(screen.getByTestId('import-preview'));
    await screen.findByTestId('import-errors-table');

    const createSpy = jest.spyOn(global.URL, 'createObjectURL');
    createSpy.mockReturnValue('blob:fake');
    await user.click(screen.getByTestId('import-download-csv'));
    expect(createSpy).toHaveBeenCalledTimes(1);
    const blob = createSpy.mock.calls[0][0];
    expect(blob.type).toMatch(/text\/csv/);
    createSpy.mockRestore();
  });
});
