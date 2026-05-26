import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { surveyAPI } from '../../services/api';
import Icon from './Icon';

/**
 * Cmd+K / Ctrl+K command palette.
 *
 * Sources surveys from the REAL `surveyAPI.getAll` via TanStack Query.
 * If the user opens the palette without an existing cached surveys
 * query (e.g. on first paint), we kick off a fetch — same staleTime
 * + retry policy as the rest of the app.
 *
 * Actions are derived from the user's role — state users get the
 * workspace actions, admins get the admin landing. Non-applicable
 * actions are filtered.
 *
 * The palette never reads from window.* globals — that mock-data
 * approach is a prototype-only pattern.
 */
const Section = ({ title, children }) => (
  <>
    <div className="fmb-cmdk-section">{title}</div>
    {children}
  </>
);

const CommandPalette = ({ open, onClose }) => {
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Fetch surveys lazily — only when the palette opens, and use the
  // cached value if it's already there.
  const { data: surveys = [] } = useQuery({
    queryKey: ['surveys'],
    queryFn: surveyAPI.getAll,
    enabled: open && !isAdmin,            // admins don't browse surveys here
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (open) {
      setQ('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
    }
  }, [open]);

  const surveyHits = useMemo(() => {
    if (isAdmin) return [];
    if (!Array.isArray(surveys)) return [];
    const lowered = q.trim().toLowerCase();
    const subset = lowered
      ? surveys.filter((s) =>
          [s.surveyName, s.surveyId, s.surveyDescription]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(lowered))
        )
      : surveys;
    return subset.slice(0, 6);
  }, [q, surveys, isAdmin]);

  const actions = useMemo(() => {
    const all = isAdmin
      ? [
          { label: 'Go to Admin Panel',           icon: 'shield', go: '/admin' },
          { label: 'Add user (Admin > Users)',    icon: 'users',  go: '/admin?tab=users' },
        ]
      : [
          { label: 'Create new survey',           icon: 'plus',   go: '/surveys/new' },
          { label: 'Import surveys',              icon: 'upload', go: '/import' },
          { label: 'Validate dumpsheet',          icon: 'shield', go: '/validator' },
          { label: 'Manage designations',         icon: 'users',  go: '/designations' },
          { label: 'Access sheet',                icon: 'key',    go: '/access-sheet' },
        ];
    const lowered = q.trim().toLowerCase();
    return lowered ? all.filter((a) => a.label.toLowerCase().includes(lowered)) : all;
  }, [q, isAdmin]);

  const flatList = useMemo(() => {
    const items = [];
    surveyHits.forEach((s) => items.push({ type: 'survey', payload: s }));
    actions.forEach((a) => items.push({ type: 'action', payload: a }));
    return items;
  }, [surveyHits, actions]);

  const go = (entry) => {
    if (!entry) return;
    if (entry.type === 'survey') {
      navigate(`/surveys/${entry.payload.surveyId}/questions`);
    } else {
      navigate(entry.payload.go);
    }
    onClose && onClose();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(0, flatList.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flatList[activeIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose && onClose();
    }
  };

  useEffect(() => {
    // Re-clamp the highlighted index when results change.
    setActiveIdx((i) => Math.min(i, Math.max(0, flatList.length - 1)));
  }, [flatList.length]);

  // Prefetch surveys on open so the first keystroke isn't blank.
  useEffect(() => {
    if (open && !isAdmin) {
      queryClient.prefetchQuery({
        queryKey: ['surveys'],
        queryFn: surveyAPI.getAll,
        staleTime: 1000 * 60 * 2,
      });
    }
  }, [open, isAdmin, queryClient]);

  if (!open) return null;

  return (
    <div
      className="fmb-scrim"
      style={{ alignItems: 'flex-start', paddingTop: '15vh' }}
      role="presentation"
      onClick={onClose}
      data-testid="command-palette"
    >
      <div
        className="fmb-cmdk"
        role="dialog"
        aria-label="Command palette"
        style={{ width: 600, maxWidth: '92vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="fmb-cmdk-input"
          placeholder="Search surveys, or jump to…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          aria-label="Search command palette"
        />
        <div style={{ borderTop: '1px solid var(--border, #e6e3da)', padding: 6, maxHeight: 380, overflow: 'auto' }}>
          {surveyHits.length > 0 && (
            <Section title="Surveys">
              {surveyHits.map((s, i) => (
                <div
                  key={s.surveyId}
                  className="fmb-cmdk-item"
                  aria-selected={activeIdx === i}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => go({ type: 'survey', payload: s })}
                >
                  <Icon name="file" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.surveyName || s.surveyId}</div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--text-3, #6b6b73)' }}>{s.surveyId}</div>
                  </div>
                </div>
              ))}
            </Section>
          )}
          {actions.length > 0 && (
            <Section title="Actions">
              {actions.map((a, i) => {
                const idx = surveyHits.length + i;
                return (
                  <div
                    key={a.label}
                    className="fmb-cmdk-item"
                    aria-selected={activeIdx === idx}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => go({ type: 'action', payload: a })}
                  >
                    <Icon name={a.icon} />
                    <span style={{ flex: 1 }}>{a.label}</span>
                    <Icon name="arrowRight" size={13} />
                  </div>
                );
              })}
            </Section>
          )}
          {flatList.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3, #6b6b73)', fontSize: 13 }}>
              No matches.
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--border, #e6e3da)', padding: '8px 12px', fontSize: 11, color: 'var(--text-3, #6b6b73)', display: 'flex', gap: 14 }}>
          <span><kbd className="fmb-kbd" style={{ position: 'static', transform: 'none' }}>↑↓</kbd> navigate</span>
          <span><kbd className="fmb-kbd" style={{ position: 'static', transform: 'none' }}>↵</kbd> select</span>
          <span><kbd className="fmb-kbd" style={{ position: 'static', transform: 'none' }}>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
