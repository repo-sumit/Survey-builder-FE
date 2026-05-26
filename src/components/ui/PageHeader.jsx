import React from 'react';
import Icon from './Icon';

/**
 * Shared page header: optional eyebrow + breadcrumbs, title, sub,
 * right-aligned actions, divider rule below.
 *
 * Not wired into existing screens yet — picked up during the
 * per-screen redesign phases. Lives here now so the shell can
 * import it and Storybook-style verification works in Phase 3.
 *
 * Props:
 *   eyebrow     — small mono label above the title
 *   breadcrumbs — [{ label, onClick? }] — last item always renders
 *                 as current (non-clickable visual)
 *   title       — required
 *   sub         — short description
 *   actions     — node, right side
 *   noBorder    — collapses the bottom rule
 */
const PageHeader = ({ eyebrow, breadcrumbs, title, sub, actions, noBorder = false }) => (
  <header className={`fmb-page-header${noBorder ? ' no-border' : ''}`}>
    <div>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="fmb-breadcrumbs" aria-label="Breadcrumb">
          {breadcrumbs.map((b, i) => {
            const last = i === breadcrumbs.length - 1;
            return (
              <React.Fragment key={`${b.label}-${i}`}>
                {i > 0 && <Icon name="chevronRight" size={11} />}
                {last ? (
                  <span className="fmb-bc-current">{b.label}</span>
                ) : b.onClick ? (
                  <button type="button" onClick={b.onClick}>{b.label}</button>
                ) : (
                  <span>{b.label}</span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}
      {eyebrow && <div className="fmb-eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}
      <h1 className="fmb-page-title">{title}</h1>
      {sub && <p className="fmb-page-sub">{sub}</p>}
    </div>
    {actions && <div className="fmb-page-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
  </header>
);

export default PageHeader;
