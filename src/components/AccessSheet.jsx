import React, { useState, useEffect, useCallback } from 'react';
import { accessSheetAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const AccessSheet = () => {
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

  return (
    <div className="question-list-container">

      {/* ── Page Header ── */}
      <div className="list-header">
        <div>
          <h2>Access Sheet</h2>
          <p className="subtitle">Generate and download state-specific access sheets from designation data</p>
        </div>
      </div>

      {/* ── Admin State Selector ── */}
      {isAdmin && (
        <div className="access-sheet-state-row">
          <div className="admin-form-card" style={{ padding: '1.25rem 1.5rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>State Code</label>
              <div style={{ maxWidth: 280 }}>
                <input
                  type="text"
                  value={adminState}
                  onChange={e => setAdminState(e.target.value.toUpperCase())}
                  placeholder="e.g., MH"
                  maxLength={10}
                />
              </div>
              <small>Required to dump or download a specific state's sheet</small>
            </div>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && <div className="error-message">{error}</div>}

      {/* ── Success ── */}
      {dumpSuccess && <div className="success-message">✓ Access sheet dumped successfully!</div>}

      {/* ── Validation Issues ── */}
      {validationIssues && validationIssues.length > 0 && (
        <div className="access-sheet-validation-card">
          <div className="access-sheet-validation-header">
            <h3>⚠ Validation Failed — Sheet was NOT saved</h3>
            <button
              className="btn btn-secondary btn-sm btn-cta btn-icon-cancel"
              onClick={() => setValidationIssues(null)}
            >
              Dismiss
            </button>
          </div>
          <div className="errors-table-container" style={{ marginTop: '1rem' }}>
            <table className="errors-table">
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
        </div>
      )}

      {/* ── CTA Cards ── */}
      <div className="access-sheet-cta-grid">

        {/* Dump card */}
        <div className="access-sheet-card">
          <div className="access-sheet-card-icon">📋</div>
          <h3>Dump New Access Sheet</h3>
          <p>
            Generates a fresh XLSX from the current designations for{' '}
            {effectiveState ? <strong>{effectiveState}</strong> : 'your state'}.{' '}
            Overwrites any previously stored dump.
          </p>
          <button
            className="btn btn-primary btn-cta btn-icon-download"
            onClick={handleDump}
            disabled={dumping || (isAdmin && !adminState.trim())}
          >
            {dumping ? 'Generating…' : 'Dump New Sheet'}
          </button>
        </div>

        {/* Download card */}
        <div className="access-sheet-card">
          <div className="access-sheet-card-icon">📥</div>
          <h3>Download Last Dumped Sheet</h3>
          {loadingMeta ? (
            <p>Loading…</p>
          ) : noData || !latest ? (
            <p>No dump exists yet for this state.</p>
          ) : (
            <div className="access-sheet-meta">
              <p><strong>File:</strong> {latest.file_name}</p>
              <p><strong>Dumped at:</strong> {fmtDate(latest.dumped_at)}</p>
              <p><strong>Dumped by:</strong> {latest.dumped_by}</p>
              {latest.summary?.designationCount !== undefined && (
                <p><strong>Designations:</strong> {latest.summary.designationCount} rows</p>
              )}
            </div>
          )}
          <button
            className="btn btn-primary btn-cta btn-icon-download"
            onClick={handleDownload}
            disabled={downloading || noData || !latest || loadingMeta}
          >
            {downloading ? 'Downloading…' : 'Download Last Sheet'}
          </button>
        </div>
      </div>

      {/* ── Info Note ── */}
      <div className="access-sheet-note">
        <strong>Note:</strong> Only the latest dump is stored per state. Each new dump overwrites the
        previous one. The downloaded file contains one row per designation as a template for filling
        in user access data.
      </div>

    </div>
  );
};

export default AccessSheet;
