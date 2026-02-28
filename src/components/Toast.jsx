import React, { createContext, useContext, useState, useCallback } from 'react';

/* ─── Toast Context ─── */
const ToastContext = createContext(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

/* ─── Toast Provider ─── */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (msg, dur) => addToast(msg, 'success', dur),
    error:   (msg, dur) => addToast(msg, 'error',   dur || 5000),
    info:    (msg, dur) => addToast(msg, 'info',    dur),
    warning: (msg, dur) => addToast(msg, 'warning', dur),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

/* ─── Toast Container ─── */
const ICONS = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
};

const ToastContainer = ({ toasts, onRemove }) => {
  if (!toasts.length) return null;

  return (
    <div style={styles.container}>
      {toasts.map((t) => (
        <div key={t.id} style={{ ...styles.toast, ...styles[t.type] }}>
          <span style={styles.icon}>{ICONS[t.type]}</span>
          <span style={styles.message}>{t.message}</span>
          <button style={styles.close} onClick={() => onRemove(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
};

/* ─── Inline styles (no class dependency) ─── */
const styles = {
  container: {
    position: 'fixed',
    bottom: '80px',
    right: '1.25rem',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    maxWidth: '360px',
    width: 'calc(100% - 2.5rem)',
  },
  toast: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.625rem',
    padding: '0.875rem 1rem',
    borderRadius: '12px',
    backdropFilter: 'blur(16px)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
    border: '1px solid',
    animation: 'fadeUp 0.25s ease',
    fontSize: '0.875rem',
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 500,
  },
  success: {
    background: 'rgba(34,197,94,0.14)',
    borderColor: 'rgba(34,197,94,0.28)',
    color: '#86efac',
  },
  error: {
    background: 'rgba(248,113,113,0.14)',
    borderColor: 'rgba(248,113,113,0.28)',
    color: '#fca5a5',
  },
  warning: {
    background: 'rgba(251,191,36,0.14)',
    borderColor: 'rgba(251,191,36,0.28)',
    color: '#fde68a',
  },
  info: {
    background: 'rgba(59,130,246,0.14)',
    borderColor: 'rgba(59,130,246,0.28)',
    color: '#93c5fd',
  },
  icon: {
    fontWeight: 700,
    flexShrink: 0,
    fontSize: '0.8rem',
    marginTop: '1px',
  },
  message: { flex: 1, lineHeight: 1.45 },
  close: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'inherit',
    opacity: 0.6,
    fontSize: '0.75rem',
    padding: 0,
    flexShrink: 0,
    lineHeight: 1,
    fontFamily: 'inherit',
  },
};

export default ToastProvider;
