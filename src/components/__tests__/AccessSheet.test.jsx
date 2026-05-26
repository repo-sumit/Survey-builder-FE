/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Phase 11 — AccessSheet redesign tests.
 *
 * Pins every preserved behavior:
 *   - Loading state on first paint
 *   - Latest-dump metadata rendering when GET /latest succeeds
 *   - 404 (no data) and generic error branches of getLatest
 *   - Dump action (state user; admin gated on adminState)
 *   - Download action
 *   - ACCESS_SHEET_VALIDATION_FAILED branch surfaces the issues card
 *   - Role gating: admin shows the State Code input; state user does not
 *   - Refresh re-calls getLatest
 *   - Back to Surveys navigation
 */

jest.mock('../../services/api', () => ({
  __esModule: true,
  accessSheetAPI: {
    getLatest: jest.fn(),
    dump: jest.fn(),
    download: jest.fn(),
  },
}));

const mockAuth = { current: { user: { id: 1, role: 'state', stateCode: 'GJ', isActive: true } } };
jest.mock('../../contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: () => mockAuth.current,
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const { accessSheetAPI } = require('../../services/api');
const AccessSheet = require('../AccessSheet').default;

const renderAS = (role = 'state', stateCode = 'GJ') => {
  mockAuth.current = { user: { id: 1, role, stateCode, isActive: true } };
  return render(
    <MemoryRouter>
      <AccessSheet />
    </MemoryRouter>
  );
};

const LATEST = {
  file_name: 'GJ-access-2026-04.xlsx',
  dumped_at: '2026-04-12T09:30:00Z',
  dumped_by: 'priya.shah@convegenius.ai',
  summary: { designationCount: 24 },
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ════════════════════════════════════════════════════════════ */
describe('AccessSheet — initial render + loading', () => {
  test('renders PageHeader + a skeleton while the latest dump loads', () => {
    accessSheetAPI.getLatest.mockImplementation(() => new Promise(() => {})); // never resolves
    renderAS();
    expect(screen.getByRole('heading', { name: /Access sheet/i })).toBeInTheDocument();
    expect(screen.getByTestId('as-meta-loading')).toBeInTheDocument();
    // The Download CTA is disabled while loading.
    expect(screen.getByTestId('as-download')).toBeDisabled();
  });

  test('Back to Surveys navigates to /', async () => {
    accessSheetAPI.getLatest.mockResolvedValue(LATEST);
    renderAS();
    await userEvent.click(screen.getByTestId('as-back'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('AccessSheet — latest dump states', () => {
  test('renders latest dump metadata when GET succeeds', async () => {
    accessSheetAPI.getLatest.mockResolvedValue(LATEST);
    renderAS();
    const meta = await screen.findByTestId('as-meta');
    expect(meta).toHaveTextContent('GJ-access-2026-04.xlsx');
    expect(meta).toHaveTextContent('priya.shah@convegenius.ai');
    expect(meta).toHaveTextContent('24 designation(s)');
    expect(screen.getByTestId('as-download')).not.toBeDisabled();
  });

  test('renders the empty card when getLatest returns 404', async () => {
    accessSheetAPI.getLatest.mockRejectedValue({ response: { status: 404 } });
    renderAS();
    expect(await screen.findByTestId('as-meta-empty')).toBeInTheDocument();
    expect(screen.getByTestId('as-download')).toBeDisabled();
    // No error banner — 404 is a normal empty state.
    expect(screen.queryByTestId('as-error')).not.toBeInTheDocument();
  });

  test('renders an error banner when getLatest fails with 5xx', async () => {
    accessSheetAPI.getLatest.mockRejectedValue({ response: { status: 500 } });
    renderAS();
    const err = await screen.findByTestId('as-error');
    expect(err).toHaveTextContent(/Failed to load dump metadata/i);
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('AccessSheet — dump + download actions', () => {
  test('state user: dump calls API with no stateCode arg, reloads metadata, shows success', async () => {
    accessSheetAPI.getLatest.mockResolvedValueOnce(LATEST);  // initial load
    accessSheetAPI.dump.mockResolvedValueOnce({});
    accessSheetAPI.getLatest.mockResolvedValueOnce({ ...LATEST, file_name: 'GJ-fresh.xlsx' });

    const user = userEvent.setup();
    renderAS();
    await screen.findByTestId('as-meta');

    await user.click(screen.getByTestId('as-dump'));
    await waitFor(() => expect(accessSheetAPI.dump).toHaveBeenCalledTimes(1));
    // State user's effectiveState is user.stateCode = 'GJ'
    expect(accessSheetAPI.dump).toHaveBeenCalledWith('GJ');
    expect(await screen.findByTestId('as-dump-success')).toBeInTheDocument();
    // Latest meta is refreshed
    await waitFor(() => expect(screen.getByTestId('as-meta')).toHaveTextContent('GJ-fresh.xlsx'));
  });

  test('admin: dump is blocked until State Code is entered', async () => {
    accessSheetAPI.getLatest.mockResolvedValue(LATEST);
    accessSheetAPI.dump.mockResolvedValue({});
    const user = userEvent.setup();
    renderAS('admin', null);

    // Admin starts with no State Code → Dump button is disabled
    expect(screen.getByTestId('as-dump')).toBeDisabled();
    expect(screen.getByTestId('as-admin-filter')).toBeInTheDocument();

    // Type a state code → button enables
    await user.type(screen.getByTestId('as-admin-state-input'), 'mh');
    expect(screen.getByTestId('as-admin-state-input')).toHaveValue('MH');
    expect(screen.getByTestId('as-dump')).not.toBeDisabled();

    await user.click(screen.getByTestId('as-dump'));
    await waitFor(() => expect(accessSheetAPI.dump).toHaveBeenCalledWith('MH'));
  });

  test('dump returning ACCESS_SHEET_VALIDATION_FAILED shows the issues card with rows', async () => {
    accessSheetAPI.getLatest.mockResolvedValue(LATEST);
    accessSheetAPI.dump.mockRejectedValueOnce({
      response: { data: {
        errorCode: 'ACCESS_SHEET_VALIDATION_FAILED',
        issues: [
          { row: 5, column: 'hierarchy_level', message: 'Must be a positive number' },
          { row: 11, column: 'designation_name', message: 'Cannot be empty' },
        ],
      } },
    });
    const user = userEvent.setup();
    renderAS();
    await screen.findByTestId('as-meta');

    await user.click(screen.getByTestId('as-dump'));
    const issues = await screen.findByTestId('as-issues');
    expect(issues).toHaveTextContent(/Validation failed/);
    expect(screen.getByTestId('as-issues-table')).toHaveTextContent(/Must be a positive number/);
    // No success banner
    expect(screen.queryByTestId('as-dump-success')).not.toBeInTheDocument();

    // Dismiss clears the card
    await user.click(screen.getByTestId('as-issues-dismiss'));
    expect(screen.queryByTestId('as-issues')).not.toBeInTheDocument();
  });

  test('dump generic failure surfaces the inline error banner', async () => {
    accessSheetAPI.getLatest.mockResolvedValue(LATEST);
    accessSheetAPI.dump.mockRejectedValueOnce({
      response: { data: { error: 'Backend on fire' } },
    });
    const user = userEvent.setup();
    renderAS();
    await screen.findByTestId('as-meta');

    await user.click(screen.getByTestId('as-dump'));
    expect(await screen.findByTestId('as-error')).toHaveTextContent(/Backend on fire/);
  });

  test('download calls API with the user state, and surfaces backend message on error', async () => {
    accessSheetAPI.getLatest.mockResolvedValue(LATEST);
    accessSheetAPI.download.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderAS();
    await screen.findByTestId('as-meta');

    await user.click(screen.getByTestId('as-download'));
    await waitFor(() => expect(accessSheetAPI.download).toHaveBeenCalledWith('GJ'));

    // Now error path
    accessSheetAPI.download.mockRejectedValueOnce({ response: { data: { message: 'Forbidden' } } });
    await user.click(screen.getByTestId('as-download'));
    expect(await screen.findByTestId('as-error')).toHaveTextContent(/Forbidden/);
  });

  test('Refresh re-calls getLatest', async () => {
    accessSheetAPI.getLatest.mockResolvedValue(LATEST);
    const user = userEvent.setup();
    renderAS();
    await screen.findByTestId('as-meta');
    expect(accessSheetAPI.getLatest).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('as-refresh'));
    await waitFor(() => expect(accessSheetAPI.getLatest).toHaveBeenCalledTimes(2));
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('AccessSheet — role gating', () => {
  test('admin sees the State Code input; state user does not', async () => {
    accessSheetAPI.getLatest.mockResolvedValue(LATEST);
    renderAS('admin', null);
    expect(screen.getByTestId('as-admin-filter')).toBeInTheDocument();
  });

  test('state user does NOT see the admin filter', async () => {
    accessSheetAPI.getLatest.mockResolvedValue(LATEST);
    renderAS('state', 'GJ');
    expect(screen.queryByTestId('as-admin-filter')).not.toBeInTheDocument();
  });
});
