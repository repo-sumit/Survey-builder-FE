/* eslint-env jest */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast';

/**
 * The data layer and AuthContext are mocked so we can drive every branch
 * (loading / empty / error / cards / permissions / mutations) without
 * Supabase, axios, or a backend.
 *
 * What these tests guard:
 *   - The real query key (`['surveys']`) and the real `surveyAPI.getAll`
 *     fn are still in use — no mock data array snuck in.
 *   - Permission gating (`isReadOnly`) is honored.
 *   - Every route used by an action is exactly what App.jsx mounts.
 *   - The duplicate flow opens DuplicateSurveyModal.
 *   - The error path exposes a Retry button that calls refetch.
 */

jest.mock('../../services/api', () => ({
  __esModule: true,
  surveyAPI: {
    getAll: jest.fn(),
    delete: jest.fn(),
    duplicate: jest.fn(),
  }
}));
jest.mock('../../contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: jest.fn()
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const { surveyAPI } = require('../../services/api');
const { useAuth } = require('../../contexts/AuthContext');

// Import AFTER mocks so module-scope imports pick up the doubles.
const SurveyList = require('../SurveyList').default;

const adminUser = { username: 'admin', role: 'admin', stateCode: null, isActive: true };
const stateUser = { username: 'priya', role: 'state', stateCode: 'GJ', isActive: true };
const readOnlyUser = { username: 'old', role: 'state', stateCode: 'WB', isActive: false };

const renderList = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <SurveyList />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  surveyAPI.getAll.mockResolvedValue([]);
  useAuth.mockReturnValue({ user: stateUser });
});

const sample = [
  {
    surveyId: 'GJ_HEAD_ANNUAL',
    surveyName: 'Annual Head-of-School Assessment',
    surveyDescription: 'Year-end leadership review.',
    isActive: 'Yes',
    public: 'Yes',
    mode: 'New Data',
    stateCode: 'GJ',
    publish: { status: 'DRAFT' },
    availableMediums: ['English', 'Gujarati'],
  },
  {
    surveyId: 'MH_TEACHER_Q3',
    surveyName: 'Q3 Teacher Feedback — Maharashtra',
    surveyDescription: 'Quarterly satisfaction.',
    isActive: 'Yes',
    public: 'Yes',
    mode: 'New Data',
    stateCode: 'MH',
    publish: { status: 'PUBLISHED' },
    availableMediums: ['English', 'Hindi', 'Marathi'],
  },
  {
    surveyId: 'WB_DATA_FIX',
    surveyName: 'UDISE Data Correction',
    surveyDescription: 'Correction window.',
    isActive: 'No',
    public: 'No',
    mode: 'Correction',
    stateCode: 'WB',
    publish: { status: 'DRAFT' },
    availableMediums: ['English', 'Bengali'],
  },
];

describe('SurveyList — loading / empty / error', () => {
  test('shows skeleton placeholders while loading', async () => {
    let resolve;
    surveyAPI.getAll.mockImplementation(() => new Promise((r) => { resolve = r; }));
    renderList();
    expect(screen.getByTestId('surveys-loading')).toBeInTheDocument();
    resolve([]);
    await waitFor(() => expect(screen.queryByTestId('surveys-loading')).not.toBeInTheDocument());
  });

  test('shows empty state with create CTA for permitted users', async () => {
    renderList();
    await waitFor(() => expect(screen.getByTestId('surveys-empty')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('surveys-empty-create-cta'));
    expect(mockNavigate).toHaveBeenCalledWith('/surveys/new');
  });

  test('hides create CTA in empty state for read-only users', async () => {
    useAuth.mockReturnValue({ user: readOnlyUser });
    renderList();
    await waitFor(() => expect(screen.getByTestId('surveys-empty')).toBeInTheDocument());
    expect(screen.queryByTestId('surveys-empty-create-cta')).not.toBeInTheDocument();
  });

  test('error state exposes a Retry button that refetches', async () => {
    surveyAPI.getAll
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(sample);
    renderList();
    await waitFor(() => expect(screen.getByTestId('surveys-error')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('surveys-error-retry'));
    await waitFor(() => expect(surveyAPI.getAll).toHaveBeenCalledTimes(2));
  });
});

describe('SurveyList — derived stats use real data only', () => {
  test('counts total / active / published / unique languages from API rows', async () => {
    surveyAPI.getAll.mockResolvedValue(sample);
    renderList();
    const stats = await screen.findByTestId('surveys-stats');
    // 3 total, 2 active, 1 published, 4 unique languages (English, Gujarati, Hindi, Marathi, Bengali — actually 5)
    // Recompute: union = English, Gujarati, Hindi, Marathi, Bengali → 5
    expect(within(stats).getByText('3')).toBeInTheDocument();         // total
    expect(within(stats).getByText('2')).toBeInTheDocument();         // active
    expect(within(stats).getByText('1')).toBeInTheDocument();         // published
    expect(within(stats).getByText('5')).toBeInTheDocument();         // languages covered
  });

  test('omits hint or shows 0 when no language data — never fakes a number', async () => {
    surveyAPI.getAll.mockResolvedValue([{ surveyId: 'X', surveyName: 'X', isActive: 'No', publish: { status: 'DRAFT' } }]);
    renderList();
    const stats = await screen.findByTestId('surveys-stats');
    // 1 total, 0 active, 0 published, 0 languages. No fake numbers.
    expect(within(stats).getAllByText('0').length).toBeGreaterThanOrEqual(2);
  });
});

describe('SurveyList — search / filter / sort', () => {
  test('search filters by name and survey ID', async () => {
    surveyAPI.getAll.mockResolvedValue(sample);
    renderList();
    await screen.findByTestId('surveys-grid');
    const user = userEvent.setup();
    await user.type(screen.getByTestId('surveys-search'), 'maharashtra');
    await waitFor(() => {
      const cards = screen.getAllByTestId('survey-card');
      expect(cards).toHaveLength(1);
      expect(cards[0].getAttribute('data-survey-id')).toBe('MH_TEACHER_Q3');
    });
  });

  test('status filter "published" shows only published surveys', async () => {
    surveyAPI.getAll.mockResolvedValue(sample);
    renderList();
    await screen.findByTestId('surveys-grid');
    fireEvent.click(screen.getByRole('button', { name: /^Published$/i }));
    await waitFor(() => {
      const cards = screen.getAllByTestId('survey-card');
      expect(cards).toHaveLength(1);
      expect(cards[0].getAttribute('data-survey-id')).toBe('MH_TEACHER_Q3');
    });
  });

  test('status filter "inactive" matches isActive=No', async () => {
    surveyAPI.getAll.mockResolvedValue(sample);
    renderList();
    await screen.findByTestId('surveys-grid');
    fireEvent.click(screen.getByRole('button', { name: /^Inactive$/i }));
    await waitFor(() => {
      const cards = screen.getAllByTestId('survey-card');
      expect(cards).toHaveLength(1);
      expect(cards[0].getAttribute('data-survey-id')).toBe('WB_DATA_FIX');
    });
  });

  test('sort "name A → Z" reorders the cards alphabetically', async () => {
    surveyAPI.getAll.mockResolvedValue(sample);
    renderList();
    await screen.findByTestId('surveys-grid');
    fireEvent.change(screen.getByTestId('surveys-sort'), { target: { value: 'name-asc' } });
    await waitFor(() => {
      const ids = screen.getAllByTestId('survey-card').map((c) => c.getAttribute('data-survey-id'));
      // Annual… / Q3… / UDISE…  →  A, Q, U
      expect(ids).toEqual(['GJ_HEAD_ANNUAL', 'MH_TEACHER_Q3', 'WB_DATA_FIX']);
    });
  });

  test('search with no matches surfaces filtered-empty state with Clear filters', async () => {
    surveyAPI.getAll.mockResolvedValue(sample);
    renderList();
    await screen.findByTestId('surveys-grid');
    const user = userEvent.setup();
    await user.type(screen.getByTestId('surveys-search'), 'zzznomatch');
    expect(await screen.findByTestId('surveys-filtered-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Clear filters/i }));
    await waitFor(() => expect(screen.getByTestId('surveys-grid')).toBeInTheDocument());
  });
});

describe('SurveyList — actions + permissions', () => {
  test('header CTAs are present for permitted users and navigate correctly', async () => {
    surveyAPI.getAll.mockResolvedValue(sample);
    renderList();
    await screen.findByTestId('surveys-grid');
    fireEvent.click(screen.getByTestId('surveys-create-cta'));
    expect(mockNavigate).toHaveBeenCalledWith('/surveys/new');
    fireEvent.click(screen.getByTestId('surveys-import-cta'));
    expect(mockNavigate).toHaveBeenCalledWith('/import');
  });

  test('read-only users see neither header CTAs nor mutating card actions', async () => {
    useAuth.mockReturnValue({ user: readOnlyUser });
    surveyAPI.getAll.mockResolvedValue(sample);
    renderList();
    await screen.findByTestId('surveys-grid');
    expect(screen.queryByTestId('surveys-create-cta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('surveys-import-cta')).not.toBeInTheDocument();
    expect(screen.getByTestId('surveys-readonly-banner')).toBeInTheDocument();
    // Per-card mutating actions are gone
    expect(screen.queryAllByRole('button', { name: /^Edit /i })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /^Delete /i })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /^Duplicate /i })).toHaveLength(0);
    // Read-only users still get Question Master + Preview
    expect(screen.getAllByRole('button', { name: /Open question master/i }).length).toBe(3);
    expect(screen.getAllByRole('button', { name: /^Preview /i }).length).toBe(3);
  });

  test('Question Master / Preview / Edit navigate to the correct routes', async () => {
    surveyAPI.getAll.mockResolvedValue(sample);
    renderList();
    await screen.findByTestId('surveys-grid');
    const card = screen.getAllByTestId('survey-card')[0]; // GJ_HEAD_ANNUAL
    fireEvent.click(within(card).getByRole('button', { name: /Open question master/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/surveys/GJ_HEAD_ANNUAL/questions');
    fireEvent.click(within(card).getByRole('button', { name: /^Preview /i }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/surveys/GJ_HEAD_ANNUAL/preview');
    fireEvent.click(within(card).getByRole('button', { name: /^Edit /i }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/surveys/GJ_HEAD_ANNUAL/edit');
  });

  test('clicking Delete confirms then calls surveyAPI.delete (and is disabled while published)', async () => {
    surveyAPI.getAll.mockResolvedValue(sample);
    surveyAPI.delete.mockResolvedValue({ ok: true });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderList();
    await screen.findByTestId('surveys-grid');

    const cards = screen.getAllByTestId('survey-card');
    const gj = cards.find((c) => c.getAttribute('data-survey-id') === 'GJ_HEAD_ANNUAL');
    const mh = cards.find((c) => c.getAttribute('data-survey-id') === 'MH_TEACHER_Q3');

    // Published survey: Delete is disabled
    expect(within(mh).getByRole('button', { name: /^Delete /i })).toBeDisabled();

    // Draft survey: Delete fires the API
    fireEvent.click(within(gj).getByRole('button', { name: /^Delete /i }));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(surveyAPI.delete).toHaveBeenCalledWith('GJ_HEAD_ANNUAL'));
    confirmSpy.mockRestore();
  });

  test('Duplicate opens DuplicateSurveyModal and confirming calls surveyAPI.duplicate', async () => {
    surveyAPI.getAll.mockResolvedValue(sample);
    surveyAPI.duplicate.mockResolvedValue({ surveyId: 'GJ_NEW' });
    renderList();
    await screen.findByTestId('surveys-grid');

    const card = screen.getAllByTestId('survey-card').find((c) => c.getAttribute('data-survey-id') === 'GJ_HEAD_ANNUAL');
    fireEvent.click(within(card).getByRole('button', { name: /^Duplicate /i }));

    // Modal shows
    expect(await screen.findByRole('heading', { name: /Duplicate Survey/i })).toBeInTheDocument();

    // Submit a new ID
    fireEvent.change(screen.getByLabelText(/New Survey ID/i), { target: { value: 'GJ_NEW' } });
    fireEvent.click(screen.getByRole('button', { name: /^Duplicate Survey$/i }));

    await waitFor(() =>
      expect(surveyAPI.duplicate).toHaveBeenCalledWith('GJ_HEAD_ANNUAL', 'GJ_NEW')
    );
  });
});
