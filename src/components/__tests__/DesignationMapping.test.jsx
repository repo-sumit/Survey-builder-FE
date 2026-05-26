/* eslint-env jest */
import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Phase 11 — DesignationMapping redesign tests.
 *
 * Pins every preserved behavior:
 *   - Loading state on first paint
 *   - getAll renders rows with hierarchy badges
 *   - Admin filter passes stateCode to getAll
 *   - State user is scoped to their own stateCode automatically
 *   - Summary metrics derive only from rendered rows
 *   - Add flow → create() with correct payload, then reload
 *   - Edit flow → update() with id + payload
 *   - Delete flow → window.confirm gates delete()
 *   - Export flow → exportXlsx() respects filter scope
 *   - Seed defaults → seedDefaults() gated on a chosen state
 *   - Validation: hierarchy level + required text fields
 */

jest.mock('../../services/api', () => ({
  __esModule: true,
  designationAPI: {
    getAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    seedDefaults: jest.fn(),
    exportXlsx: jest.fn(),
  },
  stateConfigAPI: { getAll: jest.fn() },
}));

const mockAuth = { current: { user: { id: 1, role: 'state', stateCode: 'GJ', isActive: true } } };
jest.mock('../../contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: () => mockAuth.current,
}));

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../Toast', () => ({
  __esModule: true,
  useToast: () => mockToast,
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const { designationAPI, stateConfigAPI } = require('../../services/api');
const DesignationMapping = require('../DesignationMapping').default;

const STATE_CONFIGS = [
  { state_code: 'GJ', state_name: 'Gujarat',         available_languages: 'English,Hindi,Gujarati' },
  { state_code: 'MH', state_name: 'Maharashtra',     available_languages: 'English,Marathi' },
  { state_code: 'HP', state_name: 'Himachal Pradesh', available_languages: 'English,Hindi' },
];

const SAMPLE_ROWS = [
  { id: 1, state_code: 'GJ', hierarchy_level: 1, designation_name: 'State Project Director', medium: 'English',  medium_in_english: 'English' },
  { id: 2, state_code: 'GJ', hierarchy_level: 2, designation_name: 'District Officer',         medium: 'English',  medium_in_english: 'English' },
  { id: 3, state_code: 'GJ', hierarchy_level: 3, designation_name: 'School Head',              medium: 'English',  medium_in_english: 'English' },
];

const renderDM = (role = 'state', stateCode = 'GJ') => {
  mockAuth.current = { user: { id: 1, role, stateCode, isActive: true } };
  return render(
    <MemoryRouter>
      <DesignationMapping />
    </MemoryRouter>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  stateConfigAPI.getAll.mockResolvedValue(STATE_CONFIGS);
});

/* ════════════════════════════════════════════════════════════ */
describe('DesignationMapping — initial render + loading', () => {
  test('renders PageHeader + a skeleton placeholder while getAll loads', () => {
    designationAPI.getAll.mockImplementation(() => new Promise(() => {})); // never resolves
    renderDM();
    expect(screen.getByRole('heading', { name: /Designation mapping/i })).toBeInTheDocument();
    expect(screen.getByTestId('dm-loading')).toBeInTheDocument();
  });

  test('Back navigates to /', async () => {
    designationAPI.getAll.mockResolvedValue([]);
    renderDM();
    await screen.findByTestId('dm-empty');
    await userEvent.click(screen.getByTestId('dm-back'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('DesignationMapping — data load + role-scoping', () => {
  test('state user: getAll called with their stateCode automatically', async () => {
    designationAPI.getAll.mockResolvedValue(SAMPLE_ROWS);
    renderDM('state', 'GJ');
    await screen.findByTestId('dm-list');
    expect(designationAPI.getAll).toHaveBeenCalledWith({ stateCode: 'GJ' });
    expect(screen.getAllByTestId('dm-row')).toHaveLength(3);
    // State user does NOT see the admin filter
    expect(screen.queryByTestId('dm-filter-state')).not.toBeInTheDocument();
    // Current-state chip shown
    expect(screen.getByTestId('dm-current-state')).toHaveTextContent(/Gujarat/);
  });

  test('admin: filter dropdown exists; selecting a state re-fetches with that stateCode', async () => {
    designationAPI.getAll.mockResolvedValue([]);
    renderDM('admin', null);
    await screen.findByTestId('dm-empty');
    // Initial admin GET has no stateCode (all states)
    expect(designationAPI.getAll).toHaveBeenLastCalledWith({});

    designationAPI.getAll.mockResolvedValueOnce(SAMPLE_ROWS);
    await userEvent.selectOptions(screen.getByTestId('dm-filter-state'), 'GJ');
    await waitFor(() => expect(designationAPI.getAll).toHaveBeenLastCalledWith({ stateCode: 'GJ' }));
  });

  test('summary metrics derive from current rows', async () => {
    designationAPI.getAll.mockResolvedValue(SAMPLE_ROWS);
    renderDM();
    const summary = await screen.findByTestId('dm-summary');
    // 3 rows, 3 distinct levels (1, 2, 3)
    expect(within(summary).getByTestId('dm-metric-count')).toHaveTextContent('3');
    expect(summary).toHaveTextContent(/Levels/);
  });

  test('getAll failure renders an alert banner', async () => {
    designationAPI.getAll.mockRejectedValue(new Error('boom'));
    renderDM();
    expect(await screen.findByTestId('dm-error')).toHaveTextContent(/Failed to load designations/);
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('DesignationMapping — Add flow', () => {
  test('clicking Add opens the form; submitting creates a new row with the correct payload', async () => {
    designationAPI.getAll
      .mockResolvedValueOnce(SAMPLE_ROWS)             // initial load
      .mockResolvedValueOnce([...SAMPLE_ROWS, { id: 9, state_code: 'GJ', hierarchy_level: 4, designation_name: 'New Role', medium: 'Hindi', medium_in_english: 'Hindi' }]);
    designationAPI.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderDM('state', 'GJ');
    await screen.findByTestId('dm-list');

    await user.click(screen.getByTestId('dm-add'));
    const form = await screen.findByTestId('dm-form');
    // Language is auto-set when only one is available; here GJ has 3 — user selects.
    await user.selectOptions(within(form).getByLabelText(/Language/i), 'Hindi');
    await user.type(within(form).getByLabelText(/Hierarchy level/i), '4');
    await user.type(within(form).getByLabelText(/^Designation/), 'New Role');
    // Medium (local script) — clear first to drop the auto-synced "Hindi"
    const mediumInput = within(form).getByLabelText(/Medium \(local script\)/);
    await user.clear(mediumInput);
    await user.type(mediumInput, 'हिन्दी');

    await user.click(screen.getByTestId('dm-form-save'));

    await waitFor(() => expect(designationAPI.create).toHaveBeenCalledWith({
      hierarchy_level: 4,
      designation_name: 'New Role',
      medium: 'हिन्दी',
      medium_in_english: 'Hindi',
      stateCode: 'GJ',
    }));
    // Form closes + list re-fetched
    await waitFor(() => expect(screen.queryByTestId('dm-form')).not.toBeInTheDocument());
  });

  test('Add form validation: positive hierarchy required', async () => {
    designationAPI.getAll.mockResolvedValue([]);
    const user = userEvent.setup();
    renderDM('state', 'GJ');
    await screen.findByTestId('dm-empty');
    await user.click(screen.getByTestId('dm-add'));
    // Submit empty form
    await user.click(screen.getByTestId('dm-form-save'));
    expect(screen.getByTestId('dm-form-error')).toHaveTextContent(/positive number/i);
    expect(designationAPI.create).not.toHaveBeenCalled();
  });

  test('Add form validation: all text fields required', async () => {
    designationAPI.getAll.mockResolvedValue([]);
    const user = userEvent.setup();
    renderDM('state', 'GJ');
    await screen.findByTestId('dm-empty');
    await user.click(screen.getByTestId('dm-add'));
    // Fill only hierarchy level
    await user.type(screen.getByLabelText(/Hierarchy level/i), '1');
    await user.click(screen.getByTestId('dm-form-save'));
    expect(screen.getByTestId('dm-form-error')).toHaveTextContent(/required/i);
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('DesignationMapping — Edit + Delete', () => {
  test('Edit prefills + calls update() with id and patched payload', async () => {
    designationAPI.getAll.mockResolvedValue(SAMPLE_ROWS);
    designationAPI.update.mockResolvedValue({});
    const user = userEvent.setup();
    renderDM('state', 'GJ');
    const rows = await screen.findAllByTestId('dm-row');
    // Click Edit on the second row (id=2)
    await user.click(within(rows[1]).getByTestId('dm-row-edit'));
    const form = await screen.findByTestId('dm-form');

    // Prefilled designation name
    expect(within(form).getByLabelText(/^Designation/)).toHaveValue('District Officer');
    // Patch the designation name
    const nameInput = within(form).getByLabelText(/^Designation/);
    await user.clear(nameInput);
    await user.type(nameInput, 'District Coordinator');
    await user.click(screen.getByTestId('dm-form-save'));

    await waitFor(() => expect(designationAPI.update).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ designation_name: 'District Coordinator', hierarchy_level: 2 })
    ));
  });

  test('Delete gates on window.confirm; only deletes when confirmed', async () => {
    designationAPI.getAll.mockResolvedValue(SAMPLE_ROWS);
    designationAPI.delete.mockResolvedValue({});
    const confirmSpy = jest.spyOn(window, 'confirm');

    // Cancel path
    confirmSpy.mockReturnValueOnce(false);
    const user = userEvent.setup();
    renderDM('state', 'GJ');
    const rows = await screen.findAllByTestId('dm-row');
    await user.click(within(rows[0]).getByTestId('dm-row-delete'));
    expect(designationAPI.delete).not.toHaveBeenCalled();

    // Confirm path
    confirmSpy.mockReturnValueOnce(true);
    await user.click(within(rows[0]).getByTestId('dm-row-delete'));
    await waitFor(() => expect(designationAPI.delete).toHaveBeenCalledWith(1, 'GJ'));

    confirmSpy.mockRestore();
  });

  test('Delete failure surfaces a toast.error', async () => {
    designationAPI.getAll.mockResolvedValue(SAMPLE_ROWS);
    designationAPI.delete.mockRejectedValue({ response: { data: { error: 'Has dependents' } } });
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    renderDM('state', 'GJ');
    const rows = await screen.findAllByTestId('dm-row');
    await user.click(within(rows[0]).getByTestId('dm-row-delete'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Has dependents'));
  });
});

/* ════════════════════════════════════════════════════════════ */
describe('DesignationMapping — Export + Seed defaults', () => {
  test('state user: Export calls exportXlsx with their stateCode', async () => {
    designationAPI.getAll.mockResolvedValue(SAMPLE_ROWS);
    designationAPI.exportXlsx.mockResolvedValue(true);
    const user = userEvent.setup();
    renderDM('state', 'GJ');
    await screen.findByTestId('dm-list');

    await user.click(screen.getByTestId('dm-export'));
    await waitFor(() => expect(designationAPI.exportXlsx).toHaveBeenCalledWith('GJ'));
  });

  test('admin: Export passes filter state or undefined', async () => {
    designationAPI.getAll.mockResolvedValue([]);
    designationAPI.exportXlsx.mockResolvedValue(true);
    const user = userEvent.setup();
    renderDM('admin', null);
    await screen.findByTestId('dm-empty');

    // No state filter set → exportXlsx(undefined)
    await user.click(screen.getByTestId('dm-export'));
    await waitFor(() => expect(designationAPI.exportXlsx).toHaveBeenCalledWith(undefined));
  });

  test('state user: Seed defaults calls seedDefaults(stateCode) on confirm', async () => {
    designationAPI.getAll.mockResolvedValue([]);
    designationAPI.seedDefaults.mockResolvedValue({});
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    renderDM('state', 'GJ');
    await screen.findByTestId('dm-empty');

    expect(screen.getByTestId('dm-seed')).not.toBeDisabled();
    await user.click(screen.getByTestId('dm-seed'));
    await waitFor(() => expect(designationAPI.seedDefaults).toHaveBeenCalledWith('GJ'));
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/Defaults seeded/i));
  });

  test('admin: Seed defaults is disabled until a state filter is picked', async () => {
    designationAPI.getAll.mockResolvedValue([]);
    renderDM('admin', null);
    await screen.findByTestId('dm-empty');
    expect(screen.getByTestId('dm-seed')).toBeDisabled();

    // Pick a state → seed enables
    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('dm-filter-state'), 'MH');
    await waitFor(() => expect(screen.getByTestId('dm-seed')).not.toBeDisabled());
  });
});
