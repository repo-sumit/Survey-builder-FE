/* eslint-env jest */
import { renderHook, act } from '@testing-library/react';
import useTweaks, { TWEAK_DEFAULTS } from '../useTweaks';

describe('useTweaks', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-accent');
    document.documentElement.removeAttribute('data-font');
    document.body.className = '';
  });

  test('returns defaults on first mount', () => {
    const { result } = renderHook(() => useTweaks());
    const [values] = result.current;
    expect(values).toEqual(TWEAK_DEFAULTS);
  });

  test('reflects values onto <html data-*> and <body density-*>', () => {
    renderHook(() => useTweaks());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-accent')).toBe('indigo');
    expect(document.documentElement.getAttribute('data-font')).toBe('geist');
    expect(document.body.classList.contains('density-balanced')).toBe(true);
  });

  test('setTweak updates state, document attributes, and localStorage', () => {
    const { result } = renderHook(() => useTweaks());
    act(() => { result.current[1]('theme', 'dark'); });

    const [values] = result.current;
    expect(values.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(JSON.parse(localStorage.getItem('fmb-tweaks')).theme).toBe('dark');
  });

  test('setTweak with patch object merges keys', () => {
    const { result } = renderHook(() => useTweaks());
    act(() => { result.current[1]({ accent: 'teal', density: 'compact' }); });
    const [values] = result.current;
    expect(values.accent).toBe('teal');
    expect(values.density).toBe('compact');
    expect(document.body.classList.contains('density-compact')).toBe(true);
    expect(document.body.classList.contains('density-balanced')).toBe(false);
  });

  test('values persist across re-mounts via localStorage', () => {
    const first = renderHook(() => useTweaks());
    act(() => { first.result.current[1]('accent', 'amber'); });
    first.unmount();

    const second = renderHook(() => useTweaks());
    expect(second.result.current[0].accent).toBe('amber');
  });

  test('resetTweaks restores defaults', () => {
    const { result } = renderHook(() => useTweaks());
    act(() => { result.current[1]({ theme: 'dark', accent: 'teal', density: 'comfy' }); });
    act(() => { result.current[2](); });
    const [values] = result.current;
    expect(values).toEqual(TWEAK_DEFAULTS);
    expect(JSON.parse(localStorage.getItem('fmb-tweaks'))).toEqual(TWEAK_DEFAULTS);
  });

  test('survives malformed localStorage payload', () => {
    localStorage.setItem('fmb-tweaks', 'not-json');
    const { result } = renderHook(() => useTweaks());
    expect(result.current[0]).toEqual(TWEAK_DEFAULTS);
  });
});
