import React from 'react';

/**
 * Mono-font chip — for IDs, state codes, count tokens, etc.
 *
 * variant: '' (default) | 'brand' | 'accent'
 */
const Chip = ({ variant = '', children, className = '', ...rest }) => (
  <span className={`fmb-chip ${variant} ${className}`.trim()} {...rest}>
    {children}
  </span>
);

export default Chip;
