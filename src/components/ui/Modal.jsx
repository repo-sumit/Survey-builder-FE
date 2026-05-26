import React, { useEffect, useCallback } from 'react';

/**
 * Lightweight modal. Renders into the document with a scrim and
 * a centered dialog.
 *
 * This sits next to the EXISTING modal patterns (App.css `.modal-content`,
 * DuplicateSurveyModal) — it is NOT a replacement for them. Use this
 * one in newly designed screens; keep the existing ones until a
 * matching screen redesign lands.
 *
 * Props:
 *   open      — boolean
 *   onClose   — () => void; called on Esc + scrim click
 *   title     — optional header
 *   sub       — optional sub-header
 *   footer    — node, rendered in the bottom action bar
 *   width     — optional width override
 *   labelledBy — id for aria; auto-generated if absent
 */
const Modal = ({ open, onClose, title, sub, children, footer, width, labelledBy }) => {
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape' && onClose) onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('keydown', handleKey);
    // Lock scroll while the modal is up.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = overflow;
    };
  }, [open, handleKey]);

  if (!open) return null;

  const titleId = labelledBy || (title ? 'fmb-modal-title' : undefined);

  return (
    <div className="fmb-scrim" role="presentation" onClick={onClose}>
      <div
        className="fmb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={width ? { width } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || sub) && (
          <div className="fmb-modal-head">
            {title && <h3 id={titleId}>{title}</h3>}
            {sub && <p>{sub}</p>}
          </div>
        )}
        {children && <div className="fmb-modal-body">{children}</div>}
        {footer && <div className="fmb-modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
