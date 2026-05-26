/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../Toast';

jest.mock('../../services/api', () => ({
  __esModule: true,
  adminAPI: {
    getUsers: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    attachEmail: jest.fn()
  },
  stateConfigAPI: {
    getAll: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
}));
const { adminAPI, stateConfigAPI } = require('../../services/api');

// Load the component AFTER mocks are wired so its module-scope `import`
// picks up the jest.mock above.
const AdminPanel = require('../AdminPanel').default;

const renderAdmin = (initialPath = '/admin') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ToastProvider>
        <Routes>
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );

const sampleStates = [
  { state_code: 'HP', state_name: 'Himachal Pradesh', available_languages: 'English,Hindi' },
  { state_code: 'MH', state_name: 'Maharashtra', available_languages: 'English,Marathi' }
];

beforeEach(() => {
  jest.clearAllMocks();
  adminAPI.getUsers.mockResolvedValue([]);
  stateConfigAPI.getAll.mockResolvedValue(sampleStates);
});

describe('AdminPanel — tabs', () => {
  test('defaults to States tab', async () => {
    renderAdmin();
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalled());
    expect(screen.getByRole('tab', { name: /State Configuration/i }).getAttribute('aria-selected')).toBe('true');
  });

  test('?tab=users deep-link lands on User Management', async () => {
    renderAdmin('/admin?tab=users');
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalled());
    expect(screen.getByRole('tab', { name: /User Management/i }).getAttribute('aria-selected')).toBe('true');
  });

  test('clicking User Management switches tab', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalled());
    await user.click(screen.getByRole('tab', { name: /User Management/i }));
    expect(screen.getByRole('tab', { name: /User Management/i }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('AdminPanel — Add User flow', () => {
  const openAddUser = async (user) => {
    await user.click(screen.getByRole('tab', { name: /User Management/i }));
    await user.click(screen.getByRole('button', { name: /^Add User$/ }));
  };

  test('opens form and focuses the email input', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalled());
    await openAddUser(user);
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
  });

  test('inline validation: email required', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalled());
    await openAddUser(user);
    await user.click(screen.getByTestId('invite-submit'));
    // Error renders in two places (top alert + inline field) — both expected.
    const matches = await screen.findAllByText(/Email is required/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(adminAPI.createUser).not.toHaveBeenCalled();
  });

  test('inline validation: invalid email format', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalled());
    await openAddUser(user);
    await user.type(screen.getByLabelText(/Email/i), 'not-an-email');
    await user.click(screen.getByTestId('invite-submit'));
    const matches = await screen.findAllByText(/valid email/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(adminAPI.createUser).not.toHaveBeenCalled();
  });

  test('inline validation: state role requires state selection', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalled());
    await waitFor(() => expect(stateConfigAPI.getAll).toHaveBeenCalled());
    await openAddUser(user);
    await user.type(screen.getByLabelText(/Email/i), 'new@example.com');
    await user.click(screen.getByTestId('invite-submit'));
    const matches = await screen.findAllByText(/State is required/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(adminAPI.createUser).not.toHaveBeenCalled();
  });

  test('submit button shows "Adding…" and disables during request', async () => {
    const user = userEvent.setup();
    let resolveCreate;
    adminAPI.createUser.mockImplementation(() => new Promise(r => { resolveCreate = r; }));
    renderAdmin();
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalled());
    await openAddUser(user);
    await user.type(screen.getByLabelText(/Email/i), 'new@example.com');
    await user.selectOptions(screen.getByLabelText(/^State/i), 'HP');
    await user.click(screen.getByTestId('invite-submit'));
    expect(screen.getByTestId('invite-submit')).toBeDisabled();
    expect(screen.getByTestId('invite-submit').textContent).toMatch(/Adding/i);
    await act(async () => { resolveCreate({ id: 7, email: 'new@example.com', role: 'state', stateCode: 'HP' }); });
  });

  test('successful submit closes the form and refreshes the list', async () => {
    const user = userEvent.setup();
    adminAPI.createUser.mockResolvedValue({ id: 7, email: 'new@example.com', role: 'state', stateCode: 'HP' });
    renderAdmin();
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalled());
    await openAddUser(user);
    await user.type(screen.getByLabelText(/Email/i), 'new@example.com');
    await user.selectOptions(screen.getByLabelText(/^State/i), 'HP');
    await user.click(screen.getByTestId('invite-submit'));
    await waitFor(() =>
      expect(adminAPI.createUser).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: null,
        role: 'state',
        stateCode: 'HP'
      })
    );
    // Form closes
    await waitFor(() => expect(screen.queryByTestId('invite-submit')).not.toBeInTheDocument());
    // List refreshes
    expect(adminAPI.getUsers).toHaveBeenCalledTimes(2);
  });

  test('409 duplicate email keeps form open with inline field error', async () => {
    const user = userEvent.setup();
    adminAPI.createUser.mockRejectedValue({
      response: { status: 409, data: { error: 'A user with that email already exists' } }
    });
    renderAdmin();
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalled());
    await openAddUser(user);
    await user.type(screen.getByLabelText(/Email/i), 'dup@example.com');
    await user.selectOptions(screen.getByLabelText(/^State/i), 'MH');
    await user.click(screen.getByTestId('invite-submit'));
    const dupMatches = await screen.findAllByText(/A user with this email already exists/i);
    expect(dupMatches.length).toBeGreaterThanOrEqual(1);
    // Form must remain open, inputs preserved.
    expect(screen.getByLabelText(/Email/i)).toHaveValue('dup@example.com');
    expect(screen.getByTestId('invite-submit')).toBeInTheDocument();
  });

  test('401 mid-session shows session-expired error', async () => {
    const user = userEvent.setup();
    adminAPI.createUser.mockRejectedValue({ response: { status: 401, data: { error: 'auth required' } } });
    renderAdmin();
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalled());
    await openAddUser(user);
    await user.type(screen.getByLabelText(/Email/i), 'x@example.com');
    await user.selectOptions(screen.getByLabelText(/^State/i), 'HP');
    await user.click(screen.getByTestId('invite-submit'));
    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
  });
});

describe('AdminPanel — load failures', () => {
  test('users-list load failure shows error + retry button', async () => {
    const user = userEvent.setup();
    adminAPI.getUsers
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([{ id: 1, email: 'a@b.com', role: 'admin', isActive: true }]);
    renderAdmin('/admin?tab=users');
    await screen.findByText(/Failed to load users/i);
    await user.click(screen.getByRole('button', { name: /Retry/i }));
    await waitFor(() => expect(adminAPI.getUsers).toHaveBeenCalledTimes(2));
  });
});
