import React, { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from './Toast';
import WaterAnimation from './WaterAnimation';
import PageHeader from './ui/PageHeader';
import Icon from './ui/Icon';

const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

function formatError(err, fallback = '') {
  if (typeof err === 'string') return err;
  if (typeof err === 'number' || typeof err === 'boolean') return String(err);
  if (err === null || err === undefined) return fallback;
  if (Array.isArray(err)) {
    return err.map((item) => formatError(item)).filter(Boolean).join(', ') || fallback;
  }
  if (typeof err === 'object') {
    if (typeof err.message === 'string' && err.message.trim()) return err.message;
    if (typeof err.error === 'string' && err.error.trim()) return err.error;
    try { return JSON.stringify(err); } catch { return fallback || 'Unexpected error'; }
  }
  return fallback || 'Unexpected error';
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function buildErrorCsv(rows) {
  const header = ['Survey ID', 'Type', 'Row', 'ID', 'Errors'];
  const lines = [header.map(csvEscape).join(',')];
  rows.forEach(row => {
    const errorsText = (row.errors || []).map(e => formatError(e)).join(' | ');
    lines.push([
      row.surveyId || '',
      row.type || '',
      row.index ?? row.row ?? '',
      row.questionId || row.surveyId || '',
      errorsText
    ].map(csvEscape).join(','));
  });
  return lines.join('\r\n');
}

function downloadBlob(content, filename, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const STEPS = ['Upload', 'Validate', 'Review'];

const DumpsheetValidator = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [report, setReport] = useState(null);            // { validationErrors, surveysCount, questionsCount, ... }
  const [genericError, setGenericError] = useState(null);
  const [errorFilter, setErrorFilter] = useState('all'); // 'all' | 'survey' | 'question'
  const [columnFilters, setColumnFilters] = useState({ surveyId: '', type: '', row: '', id: '', errors: '' });
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
      toast.error('Please select a valid XLSX or CSV file');
      e.target.value = '';
      return;
    }
    if (selectedFile.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      setFile(null);
      setGenericError({
        error: `File is too large. Maximum supported size is ${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024))} MB.`,
        message: 'Please split the workbook/CSV into smaller files and retry.'
      });
      e.target.value = '';
      return;
    }
    setFile(selectedFile);
    setGenericError(null);
  };

  const handleValidate = async () => {
    if (!file) {
      toast.error('Please select a file to validate');
      return;
    }
    try {
      setValidating(true);
      setGenericError(null);

      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post('/api/import/validate-dump', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: UPLOAD_TIMEOUT_MS,
      });

      setReport(response.data);
      const count = (response.data?.validationErrors || []).length;
      if (count === 0) {
        toast.success('Validation complete: no errors found.');
      } else {
        toast.warning(`Validation complete: ${count} issue(s) found.`);
      }
    } catch (err) {
      console.error('Dump validation error:', err);
      const data = err.response?.data;
      if (data?.validationErrors) {
        setReport(data);
      } else if (data) {
        setGenericError({
          error: formatError(data.error, 'Validation failed'),
          message: formatError(data.message, ''),
          details: data.details
        });
      } else {
        setGenericError({ error: formatError(err.message, 'Failed to validate file') });
      }
    } finally {
      setValidating(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setReport(null);
    setGenericError(null);
    setErrorFilter('all');
    setColumnFilters({ surveyId: '', type: '', row: '', id: '', errors: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sourceErrors = useMemo(() => report?.validationErrors || [], [report]);

  const surveyErrorCount = useMemo(
    () => sourceErrors.filter(e => e.type === 'survey').length,
    [sourceErrors]
  );
  const questionErrorCount = useMemo(
    () => sourceErrors.filter(e => e.type === 'question').length,
    [sourceErrors]
  );

  const filteredErrors = useMemo(() => {
    const lc = (s) => String(s ?? '').toLowerCase();
    const cf = {
      surveyId: lc(columnFilters.surveyId),
      type: lc(columnFilters.type),
      row: lc(columnFilters.row),
      id: lc(columnFilters.id),
      errors: lc(columnFilters.errors),
    };
    return sourceErrors.filter(e => {
      if (errorFilter !== 'all' && e.type !== errorFilter) return false;
      if (cf.surveyId && !lc(e.surveyId).includes(cf.surveyId)) return false;
      if (cf.type && !lc(e.type).includes(cf.type)) return false;
      if (cf.row && !lc(e.index ?? e.row ?? '').includes(cf.row)) return false;
      if (cf.id && !lc(e.questionId || e.surveyId || '').includes(cf.id)) return false;
      if (cf.errors) {
        const text = (e.errors || []).map(x => formatError(x)).join(' ').toLowerCase();
        if (!text.includes(cf.errors)) return false;
      }
      return true;
    });
  }, [sourceErrors, errorFilter, columnFilters]);

  const handleDownloadCsv = () => {
    if (filteredErrors.length === 0) {
      toast.info('No errors to download');
      return;
    }
    const csv = buildErrorCsv(filteredErrors);
    const baseName = (file?.name || 'dump').replace(/\.[^.]+$/, '');
    downloadBlob(`﻿${csv}`, `${baseName}-validation-errors.csv`);
  };

  const hasReport = report !== null;

  /* ── Phase derivation for the stepper ───────────────────────── */
  // Upload   → file selected
  // Validate → API has returned a report
  // Review   → looking at the report
  const currentStep = hasReport ? 2 : (file ? 1 : 0);

  return (
    <div className="fmb-dv-page" data-testid="dv-page">
      <PageHeader
        eyebrow="DATA"
        title="Dumpsheet validator"
        sub="Upload a dumpsheet to validate. Only rows with Mode = Correction or New Data are checked. Nothing is saved."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/')}
            data-testid="dv-back"
          >
            <Icon name="chevronLeft" /> Back to Surveys
          </button>
        }
      />

      <div className="fmb-dv-steps" data-testid="dv-steps" aria-label="Validation progress">
        {STEPS.map((label, idx) => {
          const stepClass = idx === currentStep
            ? 'fmb-dv-step active'
            : idx < currentStep ? 'fmb-dv-step done' : 'fmb-dv-step';
          return (
            <React.Fragment key={label}>
              {idx > 0 && <span className="fmb-dv-step-sep" aria-hidden="true">›</span>}
              <span className={stepClass}>{idx + 1}. {label}</span>
            </React.Fragment>
          );
        })}
      </div>

      {/* Instructions */}
      <section className="fmb-dv-section" aria-labelledby="dv-instructions-h">
        <header className="fmb-dv-section-head">
          <h3 id="dv-instructions-h" className="fmb-dv-section-title">How it works</h3>
          <p className="fmb-dv-section-sub">
            This tool is read-only — no surveys or questions are written to the database.
          </p>
        </header>
        <ul>
          <li>Upload an XLSX or CSV containing <strong>Survey Master</strong> and/or <strong>Question Master</strong> sheets.</li>
          <li>Rows with <code>Mode</code> set to <strong>Correction</strong> or <strong>New Data</strong> are validated.</li>
          <li>Rows with <code>Mode = None</code> (or blank) are ignored.</li>
          <li>Errors stay on screen until you click <strong>Clear</strong>.</li>
        </ul>
      </section>

      {/* Upload */}
      <section className="fmb-dv-section" aria-labelledby="dv-upload-h">
        <header className="fmb-dv-section-head">
          <h3 id="dv-upload-h" className="fmb-dv-section-title">Upload file</h3>
          <p className="fmb-dv-section-sub">Accepted: <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong>. Max 10 MB.</p>
        </header>

        <div className={`fmb-dv-dropzone${file ? ' has-file' : ''}${validating ? ' is-disabled' : ''}`} data-testid="dv-dropzone">
          <span className="fmb-dv-dropzone-icon" aria-hidden="true">
            <Icon name="upload" size={18} />
          </span>
          <div className="fmb-dv-dropzone-title">
            {file ? 'File ready — Validate or replace below' : 'Drop a workbook here, or click to choose'}
          </div>
          <div className="fmb-dv-dropzone-sub">XLSX / XLS / CSV · up to 10 MB</div>
          {file && (
            <div className="fmb-dv-file-pill" data-testid="dv-file-pill">
              <Icon name="file" size={14} />
              <code>{file.name}</code>
              <span className="fmb-dv-file-pill-size">{(file.size / 1024).toFixed(2)} KB</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            id="dump-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            disabled={validating}
            aria-label="Select XLSX, XLS, or CSV file to validate"
            data-testid="dv-file-input"
          />
        </div>

        <div className="fmb-dv-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleValidate}
            disabled={!file || validating}
            data-testid="dv-validate"
          >
            {validating ? 'Validating…' : (hasReport ? 'Re-upload & Validate' : 'Validate')}
          </button>
          {(hasReport || genericError || file) && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClear}
              disabled={validating}
              data-testid="dv-clear"
            >
              Clear
            </button>
          )}
        </div>
        <WaterAnimation active={validating} />
      </section>

      {/* Validation summary metrics */}
      {hasReport && (
        <section className="fmb-dv-section" aria-labelledby="dv-summary-h" data-testid="dv-summary">
          <header className="fmb-dv-section-head">
            <h3 id="dv-summary-h" className="fmb-dv-section-title">Validation summary</h3>
            <p className="fmb-dv-section-sub">Counts reflect rows with Mode = Correction or New Data.</p>
          </header>
          <div className="fmb-dv-metrics">
            <div className="fmb-dv-metric">
              <span className="fmb-dv-metric-label">Surveys</span>
              <span className="fmb-dv-metric-value">{report.surveysCount || 0}</span>
            </div>
            <div className="fmb-dv-metric">
              <span className="fmb-dv-metric-label">Questions</span>
              <span className="fmb-dv-metric-value">{report.questionsCount || 0}</span>
            </div>
            <div className={`fmb-dv-metric${sourceErrors.length > 0 ? ' danger' : ' ok'}`}>
              <span className="fmb-dv-metric-label">Issues</span>
              <span className="fmb-dv-metric-value">{sourceErrors.length}</span>
            </div>
          </div>
        </section>
      )}

      {/* No-issues success card */}
      {hasReport && sourceErrors.length === 0 && (
        <section className="fmb-dv-success" role="status" data-testid="dv-success">
          <div className="fmb-dv-success-title">No issues found</div>
          <div>
            Validated {report.questionsCount || 0} question row(s) and {report.surveysCount || 0} survey row(s)
            with mode = Correction or New Data.
          </div>
        </section>
      )}

      {/* Generic error */}
      {genericError && (
        <section className="fmb-dv-error-card" role="alert" data-testid="dv-error-card">
          <div className="fmb-dv-error-card-title">Validation failed</div>
          <div>{formatError(genericError.error, 'Validation failed')}</div>
          {genericError.message && <div className="fmb-dv-error-card-sub">{formatError(genericError.message)}</div>}
          {Array.isArray(genericError.details?.sheetsFound) && (
            <div className="fmb-dv-error-card-sub">
              Sheets found in file: {genericError.details.sheetsFound.map(s => `"${s}"`).join(', ') || 'none'}
            </div>
          )}
        </section>
      )}

      {/* Validation errors */}
      {sourceErrors.length > 0 && (
        <section className="fmb-dv-section" aria-labelledby="dv-errors-h" data-testid="dv-errors">
          <header className="fmb-dv-section-head">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 id="dv-errors-h" className="fmb-dv-section-title">Validation errors</h3>
                <p className="fmb-dv-section-sub">
                  Showing {filteredErrors.length} of {sourceErrors.length} issue(s). Validated against rows with mode = Correction or New Data.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadCsv}
                disabled={filteredErrors.length === 0}
                data-testid="dv-download-csv"
              >
                Download CSV
              </button>
            </div>
          </header>

          <div className="fmb-dv-filter">
            <button
              type="button"
              className={`fmb-dv-filter-btn${errorFilter === 'all' ? ' active' : ''}`}
              onClick={() => setErrorFilter('all')}
              data-testid="dv-filter-all"
            >
              All ({sourceErrors.length})
            </button>
            {surveyErrorCount > 0 && (
              <button
                type="button"
                className={`fmb-dv-filter-btn${errorFilter === 'survey' ? ' active' : ''}`}
                onClick={() => setErrorFilter('survey')}
                data-testid="dv-filter-survey"
              >
                Survey ({surveyErrorCount})
              </button>
            )}
            {questionErrorCount > 0 && (
              <button
                type="button"
                className={`fmb-dv-filter-btn${errorFilter === 'question' ? ' active' : ''}`}
                onClick={() => setErrorFilter('question')}
                data-testid="dv-filter-question"
              >
                Question ({questionErrorCount})
              </button>
            )}
          </div>

          <div className="fmb-errors-table-wrap">
            <table className="fmb-errors-table" data-testid="dv-errors-table">
              <thead>
                <tr>
                  <th>Survey ID</th>
                  <th>Type</th>
                  <th>Row</th>
                  <th>ID</th>
                  <th>Errors</th>
                </tr>
                <tr className="fmb-errors-table-filter-row">
                  {['surveyId', 'type', 'row', 'id', 'errors'].map(col => (
                    <th key={col}>
                      <input
                        type="text"
                        className="fmb-errors-table-filter-input"
                        placeholder="Filter…"
                        value={columnFilters[col]}
                        onChange={(e) => setColumnFilters(prev => ({ ...prev, [col]: e.target.value }))}
                        aria-label={`Filter by ${col}`}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredErrors.map((error, idx) => (
                  <tr key={idx}>
                    <td><code>{error.surveyId || ''}</code></td>
                    <td><span className={`fmb-errors-sheet-badge ${error.type || ''}`}>{error.type}</span></td>
                    <td>{error.index ?? error.row ?? ''}</td>
                    <td><code>{error.questionId || error.surveyId || ''}</code></td>
                    <td>
                      <ul>
                        {(error.errors || []).map((err, errIdx) => (
                          <li key={errIdx}>{formatError(err)}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default DumpsheetValidator;
