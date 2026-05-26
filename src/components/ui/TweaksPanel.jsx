import React, { useEffect } from 'react';
import Icon from './Icon';

/**
 * TweaksPanel — runtime appearance controls (theme, accent, density,
 * font, nav). Lifted from the design handoff but stripped of the
 * claude.ai/design host postMessage protocol; persistence goes through
 * useTweaks → localStorage.
 *
 * Controlled component. App.jsx owns the `open` state and the values.
 */
const Section = ({ title, children }) => (
  <div className="fmb-tweaks-section">
    <div className="fmb-tweaks-section-title">{title}</div>
    {children}
  </div>
);

const Segment = ({ value, options, onChange, ariaLabel }) => (
  <div className="fmb-tweaks-segment" role="group" aria-label={ariaLabel}>
    {options.map((o) => {
      const v = typeof o === 'string' ? o : o.value;
      const label = typeof o === 'string' ? o : o.label;
      return (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      );
    })}
  </div>
);

const SelectRow = ({ label, value, options, onChange, ariaLabel }) => (
  <div className="fmb-tweaks-row">
    <label htmlFor={`fmb-tweak-${ariaLabel}`}>{label}</label>
    <select
      id={`fmb-tweak-${ariaLabel}`}
      className="fmb-tweaks-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

const SegmentRow = ({ label, value, options, onChange, ariaLabel }) => (
  <div className="fmb-tweaks-row">
    <span>{label}</span>
    <Segment value={value} options={options} onChange={onChange} ariaLabel={ariaLabel} />
  </div>
);

const TweaksPanel = ({ open, onClose, values, setTweak, onReset }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fmb-tweaks-panel" role="dialog" aria-label="Tweaks" data-testid="tweaks-panel">
      <div className="fmb-tweaks-panel-head">
        <h4>Tweaks</h4>
        <button type="button" className="fmb-icon-btn" aria-label="Close tweaks" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>

      <div className="fmb-tweaks-panel-body">
        <Section title="Appearance">
          <SegmentRow
            label="Theme"
            ariaLabel="theme"
            value={values.theme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark',  label: 'Dark' },
            ]}
            onChange={(v) => setTweak('theme', v)}
          />
          <SelectRow
            label="Accent"
            ariaLabel="accent"
            value={values.accent}
            options={[
              { value: 'indigo', label: 'Indigo (ConveGenius)' },
              { value: 'teal',   label: 'Teal' },
              { value: 'amber',  label: 'Amber' },
              { value: 'forest', label: 'Forest' },
              { value: 'ink',    label: 'Ink' },
            ]}
            onChange={(v) => setTweak('accent', v)}
          />
          <SegmentRow
            label="Density"
            ariaLabel="density"
            value={values.density}
            options={[
              { value: 'compact',  label: 'Compact' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'comfy',    label: 'Comfy' },
            ]}
            onChange={(v) => setTweak('density', v)}
          />
        </Section>

        <Section title="Typography">
          <SelectRow
            label="Display font"
            ariaLabel="font"
            value={values.font}
            options={[
              { value: 'geist',   label: 'Geist' },
              { value: 'manrope', label: 'Manrope' },
              { value: 'plex',    label: 'IBM Plex Sans' },
              { value: 'serif',   label: 'Instrument Serif' },
            ]}
            onChange={(v) => setTweak('font', v)}
          />
        </Section>

        <Section title="Layout">
          <SegmentRow
            label="Navigation"
            ariaLabel="nav"
            value={values.nav}
            options={[
              { value: 'side', label: 'Sidebar' },
              { value: 'top',  label: 'Topbar' },
            ]}
            onChange={(v) => setTweak('nav', v)}
          />
        </Section>

        {onReset && (
          <button
            type="button"
            className="fmb-icon-btn"
            onClick={onReset}
            style={{ alignSelf: 'flex-start', width: 'auto', padding: '6px 10px', fontSize: 12.5, fontFamily: 'inherit', color: 'var(--text-3, #6b6b73)' }}
          >
            Reset to defaults
          </button>
        )}
      </div>
    </div>
  );
};

export default TweaksPanel;
