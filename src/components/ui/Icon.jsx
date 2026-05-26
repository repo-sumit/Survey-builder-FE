import React from 'react';

/**
 * Lightweight SVG icon component.
 *
 * Only the names used by the new shell + primitives are included here.
 * Add more from the design handoff (`components.jsx` icon map) as
 * subsequent screen redesigns need them — do NOT bulk-import the whole
 * library; we want every icon present in production to be one we've
 * actually used.
 *
 * Usage:
 *   <Icon name="search" />
 *   <Icon name="logout" size={14} />
 */
const PATHS = {
  // navigation / shell
  home:        'M3 11l9-8 9 8M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5',
  layout:      'M3 3h18v18H3zM3 9h18M9 21V9',
  upload:      'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  shield:      'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  users:       'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  key:         'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  fileCheck:   'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M9 15l2 2 4-4',
  external:    'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3',
  logout:      'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  bell:        'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',

  // ui controls / generic
  search:      'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  settings:    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  sliders:     'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  plus:        'M12 5v14M5 12h14',
  check:       'M5 12l5 5L20 7',
  x:           'M18 6L6 18M6 6l12 12',
  chevronRight:'M9 18l6-6-6-6',
  chevronLeft: 'M15 18l-9-6 9-6',
  chevronDown: 'M6 9l6 6 6-6',
  arrowRight:  'M5 12h14M12 5l7 7-7 7',
  warn:        'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  info:        'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16v-4M12 8h.01',
  sun:         'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon:        'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  file:        'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6',
};

const Icon = ({ name, size = 16, stroke = 1.5, className = '', ...rest }) => {
  const path = PATHS[name];
  if (!path) {
    // Dev-mode warning, no production noise. Caller fell back to nothing.
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`<Icon name="${name}"> is not registered in Icon.jsx`);
    }
    return null;
  }
  // Each subpath starts with `M`; split + rejoin so we render a separate
  // <path> per move, matching the source library's behavior.
  const segments = path.split(/(?=M)/g).filter(Boolean);
  return (
    <svg
      className={`fmb-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {segments.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
};

export default Icon;
