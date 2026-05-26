import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from './Toast';
import WaterAnimation from './WaterAnimation';
import PageHeader from './ui/PageHeader';
import Icon from './ui/Icon';

const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

// Extract error message from either a string or { field, message, value } object
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
    if (typeof err.code === 'string') {
      const message = typeof err.message === 'string' && err.message.trim()
        ? err.message
        : 'Request failed';
      return `${err.code}: ${message}`;
    }
    try {
      return JSON.stringify(err);
    } catch (_jsonErr) {
      return fallback || 'Unexpected error';
    }
  }
  return fallback || 'Unexpected error';
}

function normalizeApiErrorPayload(payload, fallback = 'Import failed') {
  const normalized = payload && typeof payload === 'object' ? payload : {};
  const error = formatError(normalized.error ?? normalized, fallback) || fallback;
  const message = formatError(normalized.message, '');

  return {
    ...normalized,
    error,
    ...(message ? { message } : {})
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
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

const STEPS = ['Upload', 'Validate', 'Select', 'Import'];

const ImportSurvey = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);          // { surveys, questions, validationErrors, ... }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  const [errorFilter, setErrorFilter] = useState('all'); // 'all' | 'survey' | 'question'
  const [columnFilters, setColumnFilters] = useState({ surveyId: '', type: '', row: '', id: '', errors: '' });
  const fileInputRef = useRef(null);

  const resetAll = () => {
    setPreview(null);
    setSelectedIds(new Set());
    setResult(null);
    setErrors(null);
    setErrorFilter('all');
    setColumnFilters({ surveyId: '', type: '', row: '', id: '', errors: '' });
  };

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
      resetAll();
      setErrors({
        error: `File is too large. Maximum supported size is ${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024))} MB.`,
        message: 'Please split the workbook/CSV into smaller files and retry.'
      });
      e.target.value = '';
      return;
    }
    setFile(selectedFile);
    resetAll();
  };

  const handlePreview = async () => {
    if (!file) {
      toast.error('Please select a file to import');
      return;
    }
    try {
      setPreviewing(true);
      resetAll();

      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post('/api/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: UPLOAD_TIMEOUT_MS,
      });

      const data = response.data || {};
      setPreview(data);
      setSelectedIds(new Set((data.surveys || []).map(s => s.surveyId)));
    } catch (err) {
      console.error('Preview error:', err);
      const responseData = err.response?.data;
      if (responseData) {
        setErrors(normalizeApiErrorPayload(responseData, 'Preview failed'));
      } else {
        setErrors({ error: formatError(err.message, 'Failed to preview file') });
      }
    } finally {
      setPreviewing(false);
    }
  };

  const handleCommitImport = async () => {
    if (!file) {
      toast.error('Please select a file to import');
      return;
    }
    if (selectedIds.size === 0) {
      toast.error('Select at least one survey to import');
      return;
    }
    try {
      setImporting(true);
      setErrors(null);
      setResult(null);

      const formData = new FormData();
      formData.append('file', file);

      const params = new URLSearchParams();
      if (overwrite) params.set('overwrite', 'true');
      params.set('surveyIds', Array.from(selectedIds).join(','));

      const response = await axios.post(`/api/import?${params.toString()}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: UPLOAD_TIMEOUT_MS,
      });

      setResult(response.data);

      if (response.data.surveys && response.data.surveys.length > 0) {
        const firstSurvey = response.data.surveys[0];
        setTimeout(() => {
          navigate(`/surveys/${firstSurvey.surveyId}/questions`);
        }, 1500);
      }
    } catch (err) {
      console.error('Import error:', err);
      const responseData = err.response?.data;
      if (responseData?.validationErrors) {
        setErrors({
          ...responseData,
          error: formatError(responseData.error, 'Validation failed'),
          message: formatError(responseData.message, '')
        });
      } else if (responseData) {
        setErrors(normalizeApiErrorPayload(responseData, 'Import failed'));
      } else {
        setErrors({ error: formatError(err.message, 'Failed to import file') });
      }
    } finally {
      setImporting(false);
    }
  };

  const toggleSurvey = (surveyId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(surveyId)) next.delete(surveyId);
      else next.add(surveyId);
      return next;
    });
  };

  const toggleAll = () => {
    if (!preview?.surveys) return;
    const all = preview.surveys.map(s => s.surveyId);
    if (selectedIds.size === all.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(all));
    }
  };

  const handleClear = () => {
    setFile(null);
    resetAll();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Combined source of validation errors: prefer the commit response when
  // available (it reflects what the server actually saw on the import attempt),
  // otherwise fall back to the preview's full error list.
  const sourceErrors = useMemo(
    () => errors?.validationErrors || preview?.validationErrors || [],
    [errors, preview]
  );

  // Filter errors to selected surveys (when we have a selection) and apply the
  // type filter (survey / question / all) plus the per-column text filters.
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
      if (selectedIds.size > 0 && e.surveyId && !selectedIds.has(e.surveyId)) return false;
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
  }, [sourceErrors, selectedIds, errorFilter, columnFilters]);

  // Per-survey error counts for the selection list
  const errorCountsBySurvey = useMemo(() => {
    const counts = {};
    sourceErrors.forEach(e => {
      const id = e.surveyId || '(unknown)';
      counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
  }, [sourceErrors]);

  const selectedHaveErrors = useMemo(() => {
    return Array.from(selectedIds).some(id => (errorCountsBySurvey[id] || 0) > 0);
  }, [selectedIds, errorCountsBySurvey]);

  const surveyErrorCount = sourceErrors.filter(e => e.type === 'survey'
    && (selectedIds.size === 0 || !e.surveyId || selectedIds.has(e.surveyId))).length;
  const questionErrorCount = sourceErrors.filter(e => e.type === 'question'
    && (selectedIds.size === 0 || !e.surveyId || selectedIds.has(e.surveyId))).length;
  const visibleTotal = surveyErrorCount + questionErrorCount;

  const handleDownloadCsv = () => {
    if (filteredErrors.length === 0) {
      toast.info('No errors to download');
      return;
    }
    const csv = buildErrorCsv(filteredErrors);
    const baseName = (file?.name || 'import').replace(/\.[^.]+$/, '');
    downloadBlob(`﻿${csv}`, `${baseName}-validation-errors.csv`);
  };

  /* ── Phase derivation for the stepper ───────────────────────── */
  // Upload  → file selected
  // Validate → preview successful
  // Select  → selectedIds chosen
  // Import  → result successful
  const currentStep = result ? 3 : (preview ? 2 : (file ? 1 : 0));
  const isDone = (idx) => result ? true : idx < currentStep;

  return (
    <div className="fmb-import-page" data-testid="import-page">
      <PageHeader
        eyebrow="DATA"
        title="Import survey"
        sub="Upload an XLSX or CSV file to bring surveys and questions into the workspace."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/')}
            data-testid="import-back"
          >
            <Icon name="chevronLeft" /> Back to Surveys
          </button>
        }
      />

      {/* Stepper */}
      <div className="fmb-import-steps" data-testid="import-steps" aria-label="Import progress">
        {STEPS.map((label, idx) => {
          const stepClass = idx === currentStep
            ? 'fmb-import-step active'
            : isDone(idx) ? 'fmb-import-step done' : 'fmb-import-step';
          return (
            <React.Fragment key={label}>
              {idx > 0 && <span className="fmb-import-step-sep" aria-hidden="true">›</span>}
              <span className={stepClass}>{idx + 1}. {label}</span>
            </React.Fragment>
          );
        })}
      </div>

      {/* Instructions */}
      <section className="fmb-import-section" aria-labelledby="import-instructions-h">
        <header className="fmb-import-section-head">
          <h3 id="import-instructions-h" className="fmb-import-section-title">How import works</h3>
          <p className="fmb-import-section-sub">
            Click <strong>Preview</strong> to see what's in the file. Pick which surveys to commit, then <strong>Import Selected</strong>.
          </p>
        </header>
        <ul>
          <li>Upload an XLSX containing both <strong>Survey Master</strong> and <strong>Question Master</strong> sheets, or separate CSVs.</li>
          <li>Multi-language surveys are supported — questions sharing Survey_ID + Question_ID + Question_Type are grouped.</li>
          <li>By default, existing Survey IDs are <strong>rejected</strong> to prevent accidental data loss.</li>
          <li>Enable overwrite only when you want to replace existing surveys and their questions.</li>
        </ul>
      </section>

      {/* Upload */}
      <section className="fmb-import-section" aria-labelledby="import-upload-h">
        <header className="fmb-import-section-head">
          <h3 id="import-upload-h" className="fmb-import-section-title">Upload file</h3>
          <p className="fmb-import-section-sub">Accepted: <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong>. Max 10 MB.</p>
        </header>

        <div className="fmb-import-toggle">
          <input
            type="checkbox"
            id="overwriteCheck"
            checked={overwrite}
            onChange={e => setOverwrite(e.target.checked)}
            disabled={importing || previewing}
            data-testid="import-overwrite"
          />
          <div>
            <label htmlFor="overwriteCheck" className="fmb-import-toggle-label">
              Overwrite existing surveys with matching Survey IDs
            </label>
            <p className="fmb-import-toggle-sub">
              Unchecked: duplicates are rejected. Checked: matching surveys and questions are replaced.
            </p>
          </div>
        </div>

        <div className={`fmb-import-dropzone${file ? ' has-file' : ''}${(importing || previewing) ? ' is-disabled' : ''}`} data-testid="import-dropzone">
          <span className="fmb-import-dropzone-icon" aria-hidden="true">
            <Icon name="upload" size={18} />
          </span>
          <div className="fmb-import-dropzone-title">
            {file ? 'File ready — Preview or replace below' : 'Drop a workbook here, or click to choose'}
          </div>
          <div className="fmb-import-dropzone-sub">XLSX / XLS / CSV · up to 10 MB</div>
          {file && (
            <div className="fmb-import-file-pill" data-testid="import-file-pill">
              <Icon name="file" size={14} />
              <code>{file.name}</code>
              <span className="fmb-import-file-pill-size">{(file.size / 1024).toFixed(2)} KB</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            disabled={importing || previewing}
            aria-label="Select XLSX, XLS, or CSV file to import"
            data-testid="import-file-input"
          />
        </div>

        <div className="fmb-import-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handlePreview}
            disabled={!file || previewing || importing}
            data-testid="import-preview"
          >
            {previewing ? 'Parsing…' : (preview ? 'Re-parse File' : 'Preview File')}
          </button>
          {preview && (
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={handleCommitImport}
              disabled={importing || previewing || selectedIds.size === 0 || selectedHaveErrors}
              title={selectedHaveErrors ? 'Fix or unselect surveys with errors first' : ''}
              data-testid="import-commit"
            >
              {importing ? 'Importing…' : `Import Selected (${selectedIds.size})`}
            </button>
          )}
          {(file || preview || errors || result) && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClear}
              disabled={importing || previewing}
              data-testid="import-clear"
            >
              Clear
            </button>
          )}
        </div>
        <WaterAnimation active={previewing || importing} />
      </section>

      {/* Validation summary metrics */}
      {preview && (
        <section className="fmb-import-section" aria-labelledby="import-summary-h" data-testid="import-summary">
          <header className="fmb-import-section-head">
            <h3 id="import-summary-h" className="fmb-import-section-title">Preview summary</h3>
            <p className="fmb-import-section-sub">What we found in the file. Errors below are blocking — fix or unselect those surveys before importing.</p>
          </header>
          <div className="fmb-import-metrics">
            <div className="fmb-import-metric">
              <span className="fmb-import-metric-label">Surveys</span>
              <span className="fmb-import-metric-value">{preview.surveys?.length || 0}</span>
            </div>
            <div className="fmb-import-metric">
              <span className="fmb-import-metric-label">Questions</span>
              <span className="fmb-import-metric-value">{preview.questions?.length || 0}</span>
            </div>
            <div className={`fmb-import-metric${sourceErrors.length > 0 ? ' danger' : ' ok'}`}>
              <span className="fmb-import-metric-label">Issues</span>
              <span className="fmb-import-metric-value">{sourceErrors.length}</span>
            </div>
            <div className="fmb-import-metric">
              <span className="fmb-import-metric-label">Selected</span>
              <span className="fmb-import-metric-value">{selectedIds.size}</span>
            </div>
          </div>
        </section>
      )}

      {/* Survey picker */}
      {preview && preview.surveys && preview.surveys.length > 0 && (
        <section className="fmb-import-section" aria-labelledby="import-picker-h" data-testid="import-picker">
          <header className="fmb-import-section-head">
            <h3 id="import-picker-h" className="fmb-import-section-title">Surveys to import</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <p className="fmb-import-section-sub" style={{ margin: 0 }}>
                {selectedHaveErrors
                  ? 'One or more selected surveys have validation errors — fix them or unselect before importing.'
                  : `${selectedIds.size} of ${preview.surveys.length} selected.`}
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={toggleAll}
                data-testid="import-picker-toggle-all"
              >
                {selectedIds.size === preview.surveys.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </header>

          <div className="fmb-import-picker">
            {preview.surveys.map(s => {
              const errCount = errorCountsBySurvey[s.surveyId] || 0;
              const checked = selectedIds.has(s.surveyId);
              return (
                <label
                  key={s.surveyId}
                  className={`fmb-import-picker-row${errCount > 0 ? ' has-errors' : ''}`}
                  data-testid="import-picker-row"
                  data-survey-id={s.surveyId}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSurvey(s.surveyId)}
                    aria-label={`Select survey ${s.surveyId}`}
                  />
                  <span className="fmb-import-picker-id">{s.surveyId}</span>
                  <span className="fmb-import-picker-name">{s.surveyName || ''}</span>
                  {errCount > 0 && (
                    <span className="fmb-import-picker-errors">
                      {errCount} error{errCount === 1 ? '' : 's'}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </section>
      )}

      {/* Success */}
      {result && (
        <section className="fmb-import-success" role="status" data-testid="import-success">
          <div className="fmb-import-success-title">Import successful</div>
          <div>{result.surveysImported} survey(s) and {result.questionsImported} question(s) imported.</div>
        </section>
      )}

      {/* Generic Error (no validation errors) */}
      {errors && !errors.validationErrors && (
        <section className="fmb-import-error-card" role="alert" data-testid="import-error-card">
          <div className="fmb-import-error-card-title">Import failed</div>
          <div>{formatError(errors.error, 'Import failed')}</div>
          {errors.message && <div className="fmb-import-error-card-sub">{formatError(errors.message)}</div>}
          {Array.isArray(errors.details?.sheetsFound) && (
            <div className="fmb-import-error-card-sub">
              Sheets found in file: {errors.details.sheetsFound.map(s => `"${s}"`).join(', ') || 'none'}
            </div>
          )}
        </section>
      )}

      {/* Validation errors */}
      {sourceErrors.length > 0 && (
        <section className="fmb-import-section" aria-labelledby="import-errors-h" data-testid="import-errors">
          <header className="fmb-import-section-head">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 id="import-errors-h" className="fmb-import-section-title">Validation errors</h3>
                <p className="fmb-import-section-sub">
                  Showing {filteredErrors.length} of {sourceErrors.length} issue(s)
                  {selectedIds.size > 0 ? ' — filtered to selected survey(s).' : '.'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadCsv}
                disabled={filteredErrors.length === 0}
                data-testid="import-download-csv"
              >
                Download CSV
              </button>
            </div>
          </header>

          <div className="fmb-import-filter">
            <button
              type="button"
              className={`fmb-import-filter-btn${errorFilter === 'all' ? ' active' : ''}`}
              onClick={() => setErrorFilter('all')}
              data-testid="import-filter-all"
            >
              All ({visibleTotal})
            </button>
            {surveyErrorCount > 0 && (
              <button
                type="button"
                className={`fmb-import-filter-btn${errorFilter === 'survey' ? ' active' : ''}`}
                onClick={() => setErrorFilter('survey')}
                data-testid="import-filter-survey"
              >
                Survey ({surveyErrorCount})
              </button>
            )}
            {questionErrorCount > 0 && (
              <button
                type="button"
                className={`fmb-import-filter-btn${errorFilter === 'question' ? ' active' : ''}`}
                onClick={() => setErrorFilter('question')}
                data-testid="import-filter-question"
              >
                Question ({questionErrorCount})
              </button>
            )}
          </div>

          <div className="fmb-errors-table-wrap">
            <table className="fmb-errors-table" data-testid="import-errors-table">
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
                        placeholder="Search…"
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

export default ImportSurvey;
