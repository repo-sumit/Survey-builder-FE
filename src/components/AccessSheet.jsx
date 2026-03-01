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

  // ── Dump ─────────────────────────────────────────────────────────────────────
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

  // ── Download ──────────────────────────────────────────────────────────────────
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

      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="mb-4">
        <h2 className="fw-bold mb-1" style={{ fontSize: '1.35rem' }}>Access Sheet</h2>
        <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
          Generate and download state-specific access sheets from designation data
        </p>
      </div>

      {/* ── Admin State Selector ─────────────────────────────────── */}
      {isAdmin && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body p-3">
            <label className="form-label fw-semibold" style={{ fontSize: '0.82rem' }}>
              State Code
            </label>
            <div style={{ maxWidth: 280 }}>
              <input
                type="text"
                className="form-control form-control-sm"
                value={adminState}
                onChange={e => setAdminState(e.target.value.toUpperCase())}
                placeholder="e.g., MH"
                maxLength={10}
              />
            </div>
            <p className="text-muted mb-0 mt-1" style={{ fontSize: '0.78rem' }}>
              Required to dump or download a specific state's sheet
            </p>
          </div>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────── */}
      {error && (
        <div
          className="alert alert-danger py-2 px-3 mb-4 d-flex align-items-center gap-2"
          style={{ fontSize: '0.875rem' }}
        >
          <span>⚠</span>
          {error}
        </div>
      )}

      {/* ── Success ──────────────────────────────────────────────── */}
      {dumpSuccess && (
        <div
          className="alert alert-success py-2 px-3 mb-4 d-flex align-items-center gap-2"
          style={{ fontSize: '0.875rem' }}
        >
          <span>✓</span>
          Access sheet dumped successfully!
        </div>
      )}

      {/* ── Validation Issues ────────────────────────────────────── */}
      {validationIssues && validationIssues.length > 0 && (
        <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '3px solid var(--bs-warning)' }}>
          <div className="card-body p-3 p-md-4">
            <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
              <h6 className="fw-bold text-warning mb-0" style={{ fontSize: '0.875rem' }}>
                ⚠ Validation Failed — Sheet was NOT saved
              </h6>
              <button
                className="btn btn-outline-secondary btn-sm"
                style={{ fontSize: '0.75rem' }}
                onClick={() => setValidationIssues(null)}
              >
                Dismiss
              </button>
            </div>
            <div className="table-responsive">
              <table className="table table-hover table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ fontSize: '0.78rem' }}>Row</th>
                    <th style={{ fontSize: '0.78rem' }}>Column</th>
                    <th style={{ fontSize: '0.78rem' }}>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {validationIssues.map((issue, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: '0.82rem' }}>{issue.row}</td>
                      <td><code style={{ fontSize: '0.78rem' }}>{issue.column}</code></td>
                      <td style={{ fontSize: '0.82rem' }}>{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CTA Cards ────────────────────────────────────────────── */}
      <div className="row g-4 mb-4">

        {/* Dump card */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-4 d-flex flex-column">
              <div className="mb-3" style={{ fontSize: '2rem', lineHeight: 1 }}>📋</div>
              <h5 className="fw-bold mb-2" style={{ fontSize: '1rem' }}>
                Dump New Access Sheet
              </h5>
              <p className="text-muted flex-grow-1 mb-4" style={{ fontSize: '0.875rem' }}>
                Generates a fresh XLSX from the current designations for{' '}
                {effectiveState ? <strong>{effectiveState}</strong> : 'your state'}.{' '}
                Overwrites any previously stored dump.
              </p>
              <button
                className="btn btn-primary fw-semibold"
                onClick={handleDump}
                disabled={dumping || (isAdmin && !adminState.trim())}
              >
                {dumping ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                    Generating…
                  </>
                ) : '⬇ Dump New Sheet'}
              </button>
            </div>
          </div>
        </div>

        {/* Download card */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-4 d-flex flex-column">
              <div className="mb-3" style={{ fontSize: '2rem', lineHeight: 1 }}>📥</div>
              <h5 className="fw-bold mb-2" style={{ fontSize: '1rem' }}>
                Download Last Dumped Sheet
              </h5>
              <div className="flex-grow-1 mb-4">
                {loadingMeta ? (
                  <p className="text-muted" style={{ fontSize: '0.875rem' }}>Loading…</p>
                ) : noData || !latest ? (
                  <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                    No dump exists yet for this state.
                  </p>
                ) : (
                  <div style={{ fontSize: '0.82rem', lineHeight: 1.8 }}>
                    <div>
                      <span className="text-muted">File:</span>{' '}
                      <strong>{latest.file_name}</strong>
                    </div>
                    <div>
                      <span className="text-muted">Dumped at:</span>{' '}
                      {fmtDate(latest.dumped_at)}
                    </div>
                    <div>
                      <span className="text-muted">Dumped by:</span>{' '}
                      {latest.dumped_by}
                    </div>
                    {latest.summary?.designationCount !== undefined && (
                      <div>
                        <span className="text-muted">Designations:</span>{' '}
                        {latest.summary.designationCount} rows
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                className="btn btn-primary fw-semibold"
                onClick={handleDownload}
                disabled={downloading || noData || !latest || loadingMeta}
              >
                {downloading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                    Downloading…
                  </>
                ) : '⬇ Download Last Sheet'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Info Note ────────────────────────────────────────────── */}
      <div className="alert alert-info py-2 px-3" style={{ fontSize: '0.82rem' }}>
        <strong>Note:</strong> Only the latest dump is stored per state. Each new dump overwrites the
        previous one. The downloaded file contains one row per designation as a template for filling
        in user access data.
      </div>

    </div>
  );
};

export default AccessSheet;
