import { useCallback, useEffect, useState } from 'react';

/**
 * Tweaks persistence — light theme overrides for theme/accent/density/font/nav.
 *
 * Adapted from the design handoff's `useTweaks` but:
 *   - Strips the claude.ai/design host postMessage protocol
 *     (__edit_mode_set_keys / __edit_mode_dismissed / etc.).
 *   - Persists via localStorage instead.
 *   - Reflects values onto <html data-*> + <body class="density-…">
 *     in a single effect so callers don't have to wire it up.
 *
 * Safe defaults match ADR 0001 — light theme, indigo accent, balanced
 * density, geist font, sidebar nav.
 */
const STORAGE_KEY = 'fmb-tweaks';

const DEFAULTS = Object.freeze({
  theme: 'light',         // 'light' | 'dark'
  accent: 'indigo',       // 'indigo' | 'teal' | 'amber' | 'forest' | 'ink'
  density: 'balanced',    // 'compact' | 'balanced' | 'comfy'
  font: 'geist',          // 'geist' | 'manrope' | 'plex' | 'serif'
  nav: 'side',            // 'side' | 'top'
});

function readStored() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(values) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    /* private mode / quota — silent */
  }
}

function applyToDocument(values) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  // We use data-theme=light explicitly (rather than letting App.css's
  // existing :root defaults stand) because the existing App.css has a
  // [data-theme='light'] block that owns the legacy palette. Keep that.
  html.setAttribute('data-theme', values.theme);
  html.setAttribute('data-accent', values.accent);
  html.setAttribute('data-font', values.font);
  // Density lives on body (mirrors the prototype's `body class="density-*"`).
  const next = `density-${values.density}`;
  const body = document.body;
  if (body) {
    body.classList.forEach((cls) => {
      if (cls.startsWith('density-') && cls !== next) body.classList.remove(cls);
    });
    if (!body.classList.contains(next)) body.classList.add(next);
  }
}

export default function useTweaks() {
  const [values, setValues] = useState(() => ({ ...DEFAULTS, ...(readStored() || {}) }));

  // Reflect onto <html>/<body> on every change.
  useEffect(() => { applyToDocument(values); }, [values]);

  const setTweak = useCallback((keyOrPatch, maybeValue) => {
    setValues((prev) => {
      const patch = typeof keyOrPatch === 'object' && keyOrPatch !== null
        ? keyOrPatch
        : { [keyOrPatch]: maybeValue };
      const next = { ...prev, ...patch };
      writeStored(next);
      return next;
    });
  }, []);

  const resetTweaks = useCallback(() => {
    writeStored(DEFAULTS);
    setValues({ ...DEFAULTS });
  }, []);

  return [values, setTweak, resetTweaks];
}

export { DEFAULTS as TWEAK_DEFAULTS };
