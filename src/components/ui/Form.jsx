import React from 'react';

/**
 * Tokenized form helpers. Each is a visual surface that mirrors the
 * design — internally they are click-toggle elements, not real inputs.
 * If you need real form semantics (browser validation, autofill,
 * form submission), pair them with a hidden <input> in the caller.
 */

export const Checkbox = ({ checked, onChange, ariaLabel, disabled }) => (
  <span
    role="checkbox"
    aria-checked={!!checked}
    aria-label={ariaLabel}
    aria-disabled={disabled || undefined}
    tabIndex={disabled ? -1 : 0}
    className="fmb-checkbox"
    data-checked={!!checked}
    onClick={(e) => { e.stopPropagation(); if (!disabled && onChange) onChange(!checked); }}
    onKeyDown={(e) => {
      if (disabled) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange && onChange(!checked); }
    }}
  />
);

export const Radio = ({ checked, onChange, ariaLabel, disabled }) => (
  <span
    role="radio"
    aria-checked={!!checked}
    aria-label={ariaLabel}
    aria-disabled={disabled || undefined}
    tabIndex={disabled ? -1 : 0}
    className="fmb-radio"
    data-checked={!!checked}
    onClick={(e) => { e.stopPropagation(); if (!disabled && onChange) onChange(!checked); }}
    onKeyDown={(e) => {
      if (disabled) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange && onChange(!checked); }
    }}
  />
);

export const Toggle = ({ on, onChange, ariaLabel, disabled }) => (
  <span
    role="switch"
    aria-checked={!!on}
    aria-label={ariaLabel}
    aria-disabled={disabled || undefined}
    tabIndex={disabled ? -1 : 0}
    className="fmb-toggle"
    data-on={!!on}
    onClick={() => { if (!disabled && onChange) onChange(!on); }}
    onKeyDown={(e) => {
      if (disabled) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange && onChange(!on); }
    }}
  />
);
