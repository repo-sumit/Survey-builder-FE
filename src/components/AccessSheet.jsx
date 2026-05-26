import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { accessSheetAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from './ui/PageHeader';
import Icon from './ui/Icon';

const AccessSheet = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [latest, setLatest]                   = useState(null);
  const [noData, setNoData]                   = useState(false);
  const [loadingMeta, setLoadingMeta]         = useState(true);
  const [dumping, setDumping]                 = useState(false);
  const [downloading, setDownloading]         = useState(false);
  const [error, setError]                     = useState(null);
  const [dumpSuccess, setDumpSuccess]         = useState(false);
  const [validationIssues, setValidationIssues] = useState(null);

  // Admin: filter by state
  const [adminState, setAdminState] = useState('');

  const effectiveState = isAdmin ? adminState : user?.stateCode;

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setError(null);
    setNoData(false);
    try {
      const data = await accessSheetAPI.getLatest(effectiveState || undefined);
      setLatest(data);
    } catch (err) {
      if (err.response?.status === 404) {
        setNoData(true);
        setLatest(null);
      } else if (err.response?.status === 400) {
        setLatest(null);
      } else {
        setError('Failed to load dump metadata');
      }
    } finally {
      setLoadingMeta(false);
    }
  }, [effectiveState]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  // ── Dump ──────────────────────────────────────────────────────
  const handleDump = async () => {
    if (isAdmin && !adminState.trim()) {
      setError('Please enter a State Code to dump');
      return;
    }
    setDumping(true);
    setError(null);
    setDumpSuccess(false);
    setValidationIssues(null);
    try {
      await accessSheetAPI.dump(effectiveState || undefined);
      setDumpSuccess(true);
      setNoData(false);
      await loadMeta();
    } catch (err) {
      if (err.response?.data?.errorCode === 'ACCESS_SHEET_VALIDATION_FAILED') {
        setValidationIssues(err.response.data.issues || []);
      } else {
        setError(err.response?.data?.error || 'Failed to dump access sheet');
      }
    } finally {
      setDumping(false);
    }
  };

  // ── Download ──────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      await accessSheetAPI.download(effectiveState || undefined);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to download');
    } finally {
      setDownloading(false);
    }
  };

  const fmtDate = (iso) =>
    iso
      ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '-';

  const dumpDisabled = dumping || (isAdmin && !adminState.trim());
  const downloadDisabled = downloading || noData || !latest || loadingMeta;

  return (
    <div className="fmb-as-page" data-testid="as-page">
      <PageHeader
        eyebrow="CONFIG"
        title="Access sheet"
        sub="Generate and download state-specific access sheets from designation data. Only the latest dump is stored per state."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/')}
            data-testid="as-back"
          >
            <Icon name="chevronLeft" /> Back to Surveys
          </button>
        }
      />

      {/* Admin state filter */}
      {isAdmin && (
        <section className="fmb-as-section" aria-labelledby="as-filter-h" data-testid="as-admin-filter">
          <header className="fmb-as-section-head">
            <h3 id="as-filter-h" className="fmb-as-section-title">State filter</h3>
            <p className="fmb-as-section-sub">Required to dump or download a specific state's sheet.</p>
          </header>
          <div className="fmb-as-filter-grid">
            <div className="fmb-as-field">
              <label htmlFor="as-admin-state" className="fmb-as-field-label">State Code</label>
              <input
                id="as-admin-state"
                type="text"
                className="fmb-as-field-input"
                value={adminState}
                onChange={e => setAdminState(e.target.value.toUpperCase())}
                placeholder="e.g., MH"
                maxLength={10}
                data-testid="as-admin-state-input"
              />
              <p className="fmb-as-field-help">2–3 letter state code (uppercase).</p>
            </div>
          </div>
        </section>
      )}

      {/* Inline error / success banners */}
      {error && (
        <div className="fmb-as-error-banner" role="alert" data-testid="as-error">{error}</div>
      )}
      {dumpSuccess && (
        <div className="fmb-as-success-banner" role="status" data-testid="as-dump-success">
          <Icon name="check" size={14} />
          Access sheet dumped successfully.
        </div>
      )}

      {/* Server-side validation issues (ACCESS_SHEET_VALIDATION_FAILED) */}
      {validationIssues && validationIssues.length > 0 && (
        <section className="fmb-as-issues" role="alert" data-testid="as-issues">
          <header className="fmb-as-issues-head">
            <div>
              <h3 className="fmb-as-issues-title">Validation failed — sheet was NOT saved</h3>
              <p className="fmb-as-section-sub" style={{ marginTop: 4 }}>
                Fix the underlying designation data and try again.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setValidationIssues(null)}
              data-testid="as-issues-dismiss"
            >
              Dismiss
            </button>
          </header>
          <div className="fmb-errors-table-wrap">
            <table className="fmb-errors-table" data-testid="as-issues-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Column</th>
                  <th>Issue</th>
                </tr>
              </thead>
              <tbody>
                {validationIssues.map((issue, i) => (
                  <tr key={i}>
                    <td>{issue.row}</td>
                    <td><code>{issue.column}</code></td>
                    <td>{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Action card grid: Generate + Download */}
      <div className="fmb-as-actions-grid">

        {/* Dump card */}
        <section className="fmb-as-card" aria-labelledby="as-generate-h" data-testid="as-generate-card">
          <div className="fmb-as-card-icon" aria-hidden="true">
            <Icon name="upload" size={18} />
          </div>
          <h3 id="as-generate-h" className="fmb-as-card-title">Generate fresh dump</h3>
          <p className="fmb-as-card-desc">
            Generates a fresh XLSX from the current designations for{' '}
            <strong>{effectiveState || 'your state'}</strong>. Overwrites any previously stored dump.
          </p>
          <div className="fmb-as-card-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleDump}
              disabled={dumpDisabled}
              aria-busy={dumping}
              data-testid="as-dump"
            >
              {dumping ? 'Generating…' : 'Generate new sheet'}
            </button>
          </div>
        </section>

        {/* Download card */}
        <section className="fmb-as-card" aria-labelledby="as-download-h" data-testid="as-download-card">
          <div className="fmb-as-card-icon accent" aria-hidden="true">
            <Icon name="fileCheck" size={18} />
          </div>
          <h3 id="as-download-h" className="fmb-as-card-title">Download latest dump</h3>
          {loadingMeta ? (
            <div className="fmb-as-skel" style={{ height: 90 }} data-testid="as-meta-loading" />
          ) : noData || !latest ? (
            <div className="fmb-as-card-empty" data-testid="as-meta-empty">
              No dump exists yet for{' '}
              <strong>{effectiveState || 'this state'}</strong>. Generate one first.
            </div>
          ) : (
            <dl className="fmb-as-meta" data-testid="as-meta">
              <dt>File</dt>
              <dd className="mono">{latest.file_name}</dd>
              <dt>Dumped at</dt>
              <dd>{fmtDate(latest.dumped_at)}</dd>
              <dt>Dumped by</dt>
              <dd>{latest.dumped_by}</dd>
              {latest.summary?.designationCount !== undefined && (
                <>
                  <dt>Rows</dt>
                  <dd>{latest.summary.designationCount} designation(s)</dd>
                </>
              )}
            </dl>
          )}
          <div className="fmb-as-card-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleDownload}
              disabled={downloadDisabled}
              aria-busy={downloading}
              data-testid="as-download"
            >
              {downloading ? 'Downloading…' : 'Download last sheet'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={loadMeta}
              disabled={loadingMeta}
              data-testid="as-refresh"
            >
              Refresh
            </button>
          </div>
        </section>
      </div>

      <p className="fmb-as-note">
        <strong>Note:</strong> Only the latest dump is stored per state. Each new dump overwrites the
        previous one. The downloaded file contains one row per designation as a template for filling
        in user access data.
      </p>
    </div>
  );
};

export default AccessSheet;
