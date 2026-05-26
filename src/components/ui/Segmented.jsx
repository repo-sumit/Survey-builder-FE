import React from 'react';
import Icon from './Icon';

/**
 * Segmented control. Each option is either a string (value === label)
 * or { value, label, icon? }. Emits the selected value via onChange.
 *
 * Uses aria-pressed so the active state is reachable by assistive tech.
 */
const Segmented = ({ value, options, onChange, ariaLabel }) => (
  <div className="fmb-segmented" role="group" aria-label={ariaLabel}>
    {options.map((opt) => {
      const v = typeof opt === 'string' ? opt : opt.value;
      const label = typeof opt === 'string' ? opt : opt.label;
      const icon = typeof opt === 'object' ? opt.icon : null;
      return (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange && onChange(v)}
        >
          {icon && <Icon name={icon} size={13} />}
          {label}
        </button>
      );
    })}
  </div>
);

export default Segmented;
