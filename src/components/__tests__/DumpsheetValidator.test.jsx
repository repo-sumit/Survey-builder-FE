/* eslint-env jest */
import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Phase 10 — DumpsheetValidator redesign tests.
 *
 * Pins every preserved behavior:
 *   - File selection (valid/invalid/oversize)
 *   - Validate flow (no errors → success; with errors → table; generic error)
 *   - Filter chips
 *   - Clear/Reset
 *   - CSV download
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

jest.mock('../WaterAnimation', () => ({
  __esModule: true,
  default: ({ active }) => (active ? <div data-testid="water" /> : null),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeAll(() => {
  if (!global.URL.createObjectURL) {
    global.URL.createObjectURL = jest.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = jest.fn();
  }
});

const axios = require('axios').default;
const DumpsheetValidator = require('../DumpsheetValidator').default;

const renderDv = () => render(
  <MemoryRouter>
    <DumpsheetValidator />
  </MemoryRouter>
);

const makeFile = (name = 'dump.xlsx', size = 1024) => {
  const content = new Array(size).fill('a').join('');
  return new File([content], name, { type: 'application/octet-stream' });
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ════════════════════════════════════════════════════════════ */
describe('DumpsheetValidator — initial render', () => {
  test('renders PageHeader, stepper, instructions, dropzone', () => {
    renderDv();
    expect(screen.getByRole('heading', { name: /Dumpsheet validator/i })).toBeInTheDocument();
    expect(screen.getByTestId('dv-steps')).toBeInTheDocument();
    expect(screen.getByText(/How it works/i)).toBeInTheDocument();
    expect(screen.getByTestId('dv-dropzone')).toBeInTheDocument();
    // Validate is disabled until a file is selected
    expect(screen.getByTestId('dv-validate')).toBeDisabled();
  });

  test('Back to Surveys navigates to /', async () => {
    const user = userEvent.setup();
    renderDv();
    await user.click(screen.getByTestId('dv-back'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('DumpsheetValidator — file selection', () => {
  test('selecting a CSV shows the file pill and enables Validate', async () => {
    const user = userEvent.setup();
    renderDv();
    await user.upload(screen.getByTestId('dv-file-input'), makeFile('rows.csv'));
    expect(screen.getByTestId('dv-file-pill')).toHaveTextContent('rows.csv');
    expect(screen.getByTestId('dv-validate')).not.toBeDisabled();
  });

  test('rejects unsupported file extension with a toast error', () => {
    renderDv();
    const input = screen.getByTestId('dv-file-input');
    const badFile = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [badFile] } });
    expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/XLSX or CSV/i));
    expect(screen.queryByTestId('dv-file-pill')).not.toBeInTheDocument();
  });

  test('oversize file (>10 MB) surfaces the inline error card', async () => {
    const user = userEvent.setup();
    renderDv();
    const big = makeFile('big.xlsx', 16);
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    await user.upload(screen.getByTestId('dv-file-input'), big);
    const card = await screen.findByTestId('dv-error-card');
    expect(card).toHaveTextContent(/File is too large/i);
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('DumpsheetValidator — validate flow', () => {
  test('success with no errors shows the success card + summary metrics', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        surveysCount: 3,
        questionsCount: 42,
        validationErrors: [],
      },
    });
    const user = userEvent.setup();
    renderDv();
    await user.upload(screen.getByTestId('dv-file-input'), makeFile('dump.xlsx'));
    await user.click(screen.getByTestId('dv-validate'));

    await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
      '/api/import/validate-dump',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
    ));

    const success = await screen.findByTestId('dv-success');
    expect(success).toHaveTextContent(/No issues found/);
    expect(success).toHaveTextContent(/42 question/);

    const summary = screen.getByTestId('dv-summary');
    expect(within(summary).getByText('42')).toBeInTheDocument(); // question count
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/no errors/i));
  });

  test('validation errors render the errors table + filter chips', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        surveysCount: 2,
        questionsCount: 10,
        validationErrors: [
          { surveyId: 'S1', type: 'survey',   index: 3, errors: ['Missing description'] },
          { surveyId: 'S1', type: 'question', index: 8, questionId: 'Q1', errors: ['Bad mandatory'] },
        ],
      },
    });
    const user = userEvent.setup();
    renderDv();
    await user.upload(screen.getByTestId('dv-file-input'), makeFile('dump.xlsx'));
    await user.click(screen.getByTestId('dv-validate'));

    const table = await screen.findByTestId('dv-errors-table');
    expect(within(table).getByText(/Missing description/)).toBeInTheDocument();
    expect(within(table).getByText(/Bad mandatory/)).toBeInTheDocument();

    // Question-only filter
    await user.click(screen.getByTestId('dv-filter-question'));
    expect(within(table).queryByText(/Missing description/)).not.toBeInTheDocument();
    expect(within(table).getByText(/Bad mandatory/)).toBeInTheDocument();
  });

  test('generic API error (no validationErrors) renders the error card', async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { error: 'Sheet missing', message: 'Need Survey Master' } },
    });
    const user = userEvent.setup();
    renderDv();
    await user.upload(screen.getByTestId('dv-file-input'), makeFile('dump.xlsx'));
    await user.click(screen.getByTestId('dv-validate'));
    const card = await screen.findByTestId('dv-error-card');
    expect(card).toHaveTextContent(/Sheet missing/);
    expect(card).toHaveTextContent(/Need Survey Master/);
  });

  test('network error (no response) renders fallback error card', async () => {
    axios.post.mockRejectedValueOnce(new Error('Network down'));
    const user = userEvent.setup();
    renderDv();
    await user.upload(screen.getByTestId('dv-file-input'), makeFile('dump.xlsx'));
    await user.click(screen.getByTestId('dv-validate'));
    const card = await screen.findByTestId('dv-error-card');
    expect(card).toHaveTextContent(/Network down/);
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('DumpsheetValidator — clear + CSV', () => {
  test('Clear resets file, report, and errors', async () => {
    axios.post.mockResolvedValueOnce({
      data: { surveysCount: 1, questionsCount: 1, validationErrors: [] },
    });
    const user = userEvent.setup();
    renderDv();
    await user.upload(screen.getByTestId('dv-file-input'), makeFile('dump.xlsx'));
    await user.click(screen.getByTestId('dv-validate'));
    await screen.findByTestId('dv-success');

    await user.click(screen.getByTestId('dv-clear'));
    expect(screen.queryByTestId('dv-success')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dv-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dv-file-pill')).not.toBeInTheDocument();
  });

  test('Download CSV creates a blob when errors exist', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        surveysCount: 1, questionsCount: 1,
        validationErrors: [
          { surveyId: 'S1', type: 'question', index: 5, questionId: 'Q1', errors: ['Missing option'] },
        ],
      },
    });
    const user = userEvent.setup();
    renderDv();
    await user.upload(screen.getByTestId('dv-file-input'), makeFile('errors.csv'));
    await user.click(screen.getByTestId('dv-validate'));
    await screen.findByTestId('dv-errors-table');

    const createSpy = jest.spyOn(global.URL, 'createObjectURL');
    createSpy.mockReturnValue('blob:fake');
    await user.click(screen.getByTestId('dv-download-csv'));
    expect(createSpy).toHaveBeenCalledTimes(1);
    const blob = createSpy.mock.calls[0][0];
    expect(blob.type).toMatch(/text\/csv/);
    createSpy.mockRestore();
  });
});
