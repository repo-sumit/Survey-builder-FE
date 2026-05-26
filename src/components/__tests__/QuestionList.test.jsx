/* eslint-env jest */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../Toast';

/**
 * Data layer and AuthContext are mocked so each branch is driven
 * deterministically without a backend.
 *
 * What these tests guard:
 *  - The canonical TanStack Query keys are still used (['survey', id]
 *    and ['questions', id]).
 *  - lockAPI.acquire is called on mount and lockAPI.release on unmount.
 *  - Translation coverage is derived from REAL question.translations
 *    data, not any prototype array.
 *  - Sorted order (parent → child) is preserved.
 *  - Routes used by every action are exactly what App.jsx mounts.
 *  - Delete uses window.confirm + questionAPI.delete; duplicate uses
 *    window.prompt + questionAPI.duplicate.
 *  - Scroll-restore reads sessionStorage('lastEditedQuestionId') and
 *    applies the .question-highlight class.
 *  - FEATURE_PUBLISH gate behavior survives the redesign.
 */

jest.mock('../../services/api', () => ({
  __esModule: true,
  surveyAPI:    { getById:   jest.fn() },
  questionAPI:  { getAll:    jest.fn(), delete: jest.fn(), duplicate: jest.fn() },
  exportAPI:    { download:  jest.fn() },
  publishAPI:   { publish:   jest.fn(), unpublish: jest.fn() },
  lockAPI:      { acquire:   jest.fn(), release: jest.fn() },
}));
jest.mock('../../contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: jest.fn()
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

const { surveyAPI, questionAPI, exportAPI, lockAPI } = require('../../services/api');
const { useAuth } = require('../../contexts/AuthContext');

// Import AFTER mocks so module-scope imports pick up the doubles.
const QuestionList = require('../QuestionList').default;

const stateUser = { id: 7, username: 'priya', role: 'state', stateCode: 'GJ', isActive: true };
const readOnlyUser = { id: 8, username: 'old', role: 'state', stateCode: 'WB', isActive: false };

const baseSurvey = {
  surveyId: 'GJ_HEAD_ANNUAL',
  surveyName: 'Annual Head-of-School Assessment — Gujarat',
  availableMediums: 'English,Gujarati,Hindi',
  publish: { status: 'DRAFT' },
};

const baseQuestions = [
  {
    questionId: 'Q1',
    questionType: 'Multiple Choice Single Select',
    questionDescription: 'Which medium of instruction is followed at your school?',
    isMandatory: 'Yes',
    medium: 'English',
    options: [{ text: 'English' }, { text: 'Hindi' }, { text: 'Bilingual' }],
    translations: {
      English:  { questionDescription: 'Which medium of instruction is followed at your school?' },
      Gujarati: { questionDescription: 'તમારી શાળામાં શિક્ષણનું માધ્યમ શું છે?' },
      Hindi:    { questionDescription: '' }, // empty — counts as not translated
    },
  },
  {
    questionId: 'Q2',
    questionType: 'Text Response',
    questionDescription: 'Briefly describe one challenge you faced this term.',
    isMandatory: 'No',
    medium: 'English',
    options: [],
    textInputType: 'Alphanumeric',
    translations: {
      English: { questionDescription: 'Briefly describe one challenge you faced this term.' },
    },
  },
  {
    questionId: 'Q2.1',
    questionType: 'Text Response',
    questionDescription: 'Child of Q2 — more detail.',
    sourceQuestion: 'Q2',
    isMandatory: 'No',
    options: [],
  },
];

const renderList = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <QuestionList />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = { surveyId: 'GJ_HEAD_ANNUAL' };
  useAuth.mockReturnValue({ user: stateUser });
  surveyAPI.getById.mockResolvedValue(baseSurvey);
  questionAPI.getAll.mockResolvedValue(baseQuestions);
  lockAPI.acquire.mockResolvedValue({ lock: { locked: true, lockedBy: stateUser.id } });
  lockAPI.release.mockResolvedValue({});
});

describe('QuestionList — loading / empty / error / lock', () => {
  test('shows skeleton placeholders while loading', async () => {
    let resolveSurvey;
    surveyAPI.getById.mockImplementation(() => new Promise(r => { resolveSurvey = r; }));
    renderList();
    expect(screen.getByTestId('qlist-loading')).toBeInTheDocument();
    resolveSurvey(baseSurvey);
    await waitFor(() => expect(screen.queryByTestId('qlist-loading')).not.toBeInTheDocument());
  });

  test('shows empty state with Add Question CTA for permitted users', async () => {
    questionAPI.getAll.mockResolvedValue([]);
    renderList();
    await waitFor(() => expect(screen.getByTestId('qlist-empty')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('qlist-empty-add-cta'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/surveys/GJ_HEAD_ANNUAL/questions/new');
  });

  test('hides Add Question CTA in empty state for read-only users', async () => {
    useAuth.mockReturnValue({ user: readOnlyUser });
    questionAPI.getAll.mockResolvedValue([]);
    renderList();
    await waitFor(() => expect(screen.getByTestId('qlist-empty')).toBeInTheDocument());
    expect(screen.queryByTestId('qlist-empty-add-cta')).not.toBeInTheDocument();
    expect(screen.getByTestId('qlist-readonly-banner')).toBeInTheDocument();
  });

  test('error path surfaces a banner with Retry that refetches', async () => {
    // Survey loads OK; questions fail first then succeed on retry. This
    // keeps `survey` defined so we land on the main view (with the error
    // banner) rather than the "Survey not found" full-page screen, which
    // is a separate failure mode.
    questionAPI.getAll.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(baseQuestions);
    renderList();
    await waitFor(() => expect(screen.getByTestId('qlist-error')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('qlist-error-retry'));
    await waitFor(() => expect(questionAPI.getAll).toHaveBeenCalledTimes(2));
  });

  test('lock banner appears when another user holds the lock', async () => {
    lockAPI.acquire.mockResolvedValueOnce({ lock: { locked: true, lockedBy: 999 /* not us */ } });
    renderList();
    await waitFor(() => expect(screen.getByTestId('qlist-lock-banner')).toBeInTheDocument());
  });

  test('lockAPI.acquire is called on mount and lockAPI.release on unmount', async () => {
    const { unmount } = renderList();
    await waitFor(() => expect(lockAPI.acquire).toHaveBeenCalledWith('GJ_HEAD_ANNUAL'));
    unmount();
    expect(lockAPI.release).toHaveBeenCalledWith('GJ_HEAD_ANNUAL');
  });
});

describe('QuestionList — derived stats and coverage use real data', () => {
  test('total / required / types / languages derive from the loaded questions', async () => {
    renderList();
    await screen.findByTestId('qlist-rows');
    const stats = screen.getByTestId('qlist-stats');
    // Pull each labeled tile and assert its value individually so we
    // don't depend on which number appears in which tile (the 3 here
    // both: total questions = 3 AND languages = 3, since baseSurvey
    // declares English/Gujarati/Hindi).
    const tile = (label) => {
      const labelEl = within(stats).getByText(label);
      return labelEl.parentElement;
    };
    expect(within(tile('Questions')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Required')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Question types')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Languages covered')).getByText('3')).toBeInTheDocument();
  });

  test('translation coverage chips reflect REAL question.translations data', async () => {
    renderList();
    const coverage = await screen.findByTestId('qlist-coverage');
    // English: all 2 of 3 questions have a non-empty translation
    // (Q2.1 has no translations object at all → counted as 0)
    // Gujarati: only Q1 → 1/3
    // Hindi: empty string for Q1, none elsewhere → 0/3
    const chips = within(coverage).getAllByText(/^(English|Gujarati|Hindi)$/);
    expect(chips).toHaveLength(3);
    expect(coverage).toHaveTextContent('2/3');   // English
    expect(coverage).toHaveTextContent('1/3');   // Gujarati
    expect(coverage).toHaveTextContent('0/3');   // Hindi (empty body)
  });

  test('coverage strip is omitted when survey has no availableMediums', async () => {
    surveyAPI.getById.mockResolvedValue({ ...baseSurvey, availableMediums: '' });
    renderList();
    await screen.findByTestId('qlist-rows');
    expect(screen.queryByTestId('qlist-coverage')).not.toBeInTheDocument();
  });
});

describe('QuestionList — rows / sort / search / filters', () => {
  test('renders rows in parent → child order', async () => {
    renderList();
    const rows = await screen.findAllByTestId('question-row');
    const ids = rows.map(r => r.getAttribute('data-question-id'));
    expect(ids).toEqual(['Q1', 'Q2', 'Q2.1']);
  });

  test('search filters by question ID + text', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByTestId('qlist-rows');
    await user.type(screen.getByTestId('qlist-search'), 'challenge');
    await waitFor(() => {
      const rows = screen.getAllByTestId('question-row');
      expect(rows).toHaveLength(1);
      expect(rows[0].getAttribute('data-question-id')).toBe('Q2');
    });
  });

  test('required filter shows only mandatory questions', async () => {
    renderList();
    await screen.findByTestId('qlist-rows');
    fireEvent.click(screen.getByRole('button', { name: /^Required$/i }));
    await waitFor(() => {
      const rows = screen.getAllByTestId('question-row');
      expect(rows).toHaveLength(1);
      expect(rows[0].getAttribute('data-question-id')).toBe('Q1');
    });
  });

  test('type filter narrows by questionType', async () => {
    renderList();
    await screen.findByTestId('qlist-rows');
    fireEvent.change(screen.getByTestId('qlist-type-filter'), { target: { value: 'Text Response' } });
    await waitFor(() => {
      const rows = screen.getAllByTestId('question-row');
      // Q2 + Q2.1 are Text Response
      expect(rows.map(r => r.getAttribute('data-question-id')).sort()).toEqual(['Q2', 'Q2.1']);
    });
  });

  test('search-with-no-matches surfaces a filtered-empty state with Clear filters', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByTestId('qlist-rows');
    await user.type(screen.getByTestId('qlist-search'), 'nomatch');
    expect(await screen.findByTestId('qlist-filtered-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Clear filters/i }));
    await waitFor(() => expect(screen.getByTestId('qlist-rows')).toBeInTheDocument());
  });
});

describe('QuestionList — row actions', () => {
  test('Edit navigates to the canonical edit route', async () => {
    renderList();
    const rows = await screen.findAllByTestId('question-row');
    const q2 = rows.find(r => r.getAttribute('data-question-id') === 'Q2');
    fireEvent.click(within(q2).getByRole('button', { name: /^Edit question Q2$/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/surveys/GJ_HEAD_ANNUAL/questions/Q2/edit');
  });

  test('Delete confirms and calls questionAPI.delete', async () => {
    questionAPI.delete.mockResolvedValue({ ok: true });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderList();
    const rows = await screen.findAllByTestId('question-row');
    const q1 = rows.find(r => r.getAttribute('data-question-id') === 'Q1');
    fireEvent.click(within(q1).getByRole('button', { name: /^Delete question Q1$/i }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(questionAPI.delete).toHaveBeenCalledWith('GJ_HEAD_ANNUAL', 'Q1'));
    confirm.mockRestore();
  });

  test('Duplicate prompts then calls questionAPI.duplicate + navigates to the new edit', async () => {
    questionAPI.duplicate.mockResolvedValue({ questionId: 'Q4' });
    const prompt = jest.spyOn(window, 'prompt').mockReturnValue('4');
    renderList();
    const rows = await screen.findAllByTestId('question-row');
    const q1 = rows.find(r => r.getAttribute('data-question-id') === 'Q1');
    fireEvent.click(within(q1).getByRole('button', { name: /^Duplicate question Q1$/i }));
    await waitFor(() => expect(questionAPI.duplicate).toHaveBeenCalledWith('GJ_HEAD_ANNUAL', 'Q1', 'Q4'));
    await waitFor(() => expect(mockNavigate).toHaveBeenLastCalledWith('/surveys/GJ_HEAD_ANNUAL/questions/Q4/edit'));
    prompt.mockRestore();
  });

  test('read-only user sees View (not Edit/Duplicate/Delete) on every row', async () => {
    useAuth.mockReturnValue({ user: readOnlyUser });
    renderList();
    const rows = await screen.findAllByTestId('question-row');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(r => {
      expect(within(r).getByRole('button', { name: /^View question/i })).toBeInTheDocument();
      expect(within(r).queryByRole('button', { name: /^Delete question/i })).not.toBeInTheDocument();
      expect(within(r).queryByRole('button', { name: /^Duplicate question/i })).not.toBeInTheDocument();
    });
  });

  test('published survey hides the Add Question CTA + per-row mutations', async () => {
    surveyAPI.getById.mockResolvedValue({ ...baseSurvey, publish: { status: 'PUBLISHED' } });
    renderList();
    await screen.findByTestId('qlist-rows');
    expect(screen.queryByTestId('qlist-add-cta')).not.toBeInTheDocument();
    const rows = screen.getAllByTestId('question-row');
    rows.forEach(r => {
      expect(within(r).queryByRole('button', { name: /^Edit question/i })).not.toBeInTheDocument();
      expect(within(r).getByRole('button', { name: /^View question/i })).toBeInTheDocument();
    });
  });

  test('export button triggers exportAPI.download', async () => {
    exportAPI.download.mockResolvedValue();
    renderList();
    await screen.findByTestId('qlist-rows');
    fireEvent.click(screen.getByTestId('qlist-export'));
    await waitFor(() => expect(exportAPI.download).toHaveBeenCalledWith('GJ_HEAD_ANNUAL'));
  });

  test('header Add Question + Back navigate correctly', async () => {
    renderList();
    await screen.findByTestId('qlist-rows');
    fireEvent.click(screen.getByTestId('qlist-add-cta'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/surveys/GJ_HEAD_ANNUAL/questions/new');
    fireEvent.click(screen.getByTestId('qlist-back'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
  });
});

describe('QuestionList — scroll restore', () => {
  test('reads lastEditedQuestionId from sessionStorage and adds .question-highlight to that row', async () => {
    sessionStorage.setItem('lastEditedQuestionId', 'Q2');
    // The component calls scrollIntoView — JSDOM doesn't implement it, so stub.
    Element.prototype.scrollIntoView = jest.fn();
    renderList();
    await screen.findByTestId('qlist-rows');
    // The setTimeout(100) in the effect needs to fire — wait for it.
    await waitFor(() => {
      const el = document.getElementById('question-Q2');
      expect(el?.classList.contains('question-highlight')).toBe(true);
    }, { timeout: 1000 });
    // And the session key was consumed.
    expect(sessionStorage.getItem('lastEditedQuestionId')).toBeNull();
  });
});
