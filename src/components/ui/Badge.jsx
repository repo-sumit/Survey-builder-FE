import React from 'react';

/**
 * Status badge — pill with status-driven colors.
 *
 * `status` accepts: draft | live | review | locked | brand.
 * Anything else falls back to neutral surface-2.
 *
 * Used by the new shell + (later) redesigned screens. Existing
 * screens continue to use App.css's `.badge` family — do NOT
 * swap them out here; that's a screen-redesign concern.
 */
const Badge = ({ status = 'draft', dot = true, children }) => (
  <span className={`fmb-badge-pill ${status}`}>
    {dot && <span className="dot" />}
    {children}
  </span>
);

export default Badge;
