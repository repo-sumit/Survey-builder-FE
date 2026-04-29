import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from './Toast';

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

const DumpsheetValidator = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [report, setReport] = useState(null);            // { validationErrors, surveysCount, questionsCount, ... }
  const [genericError, setGenericError] = useState(null);
  const [errorFilter, setErrorFilter] = useState('all'); // 'all' | 'survey' | 'question'
  const [columnFilters, setColumnFilters] = useState({ surveyId: '', type: '', row: '', id: '', errors: '' });

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
    const input = document.getElementById('dump-file-input');
    if (input) input.value = '';
  };

  const sourceErrors = report?.validationErrors || [];

  const surveyErrorCount = sourceErrors.filter(e => e.type === 'survey').length;
  const questionErrorCount = sourceErrors.filter(e => e.type === 'question').length;

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

  return (
    <div className="import-survey-container">
      <div className="list-header">
        <div>
          <h2>Dumpsheet Validator</h2>
          <p className="subtitle">
            Upload a dump sheet to validate. Only rows with <strong>Mode = Correction</strong> or <strong>New Data</strong> are checked.
            Nothing is saved.
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary btn-sm btn-cta btn-icon-back"
            onClick={() => navigate('/')}
          >
            Back to Surveys
          </button>
        </div>
      </div>

      <div className="import-instructions">
        <h3>How it works</h3>
        <ul>
          <li>Upload an XLSX or CSV containing <strong>Survey Master</strong> and/or <strong>Question Master</strong> sheets</li>
          <li>Rows with <code>Mode</code> set to <strong>Correction</strong> or <strong>New Data</strong> are validated</li>
          <li>Rows with <code>Mode = None</code> (or blank) are ignored</li>
          <li>No surveys or questions are written to the database — this is read-only</li>
          <li>Errors stay on screen until you click <strong>Clear</strong></li>
        </ul>
      </div>

      <div className="admin-form-card">
        <div className="form-group">
          <label>
            Select File&nbsp;
            <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
              (XLSX, XLS or CSV)
            </span>
          </label>
          <input
            id="dump-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="file-input"
            disabled={validating}
          />
          {file && (
            <div className="file-selected">
              <strong>Selected:</strong> {file.name}&nbsp;
              <span style={{ opacity: 0.75 }}>({(file.size / 1024).toFixed(2)} KB)</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-cta"
            onClick={handleValidate}
            disabled={!file || validating}
          >
            {validating ? 'Validating…' : (hasReport ? 'Re-upload & Validate' : 'Validate')}
          </button>
          {(hasReport || genericError || file) && (
            <button
              className="btn btn-secondary btn-cta"
              onClick={handleClear}
              disabled={validating}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {report && sourceErrors.length === 0 && (
        <div className="import-success">
          <h3>No issues found</h3>
          <p>
            Validated {report.questionsCount || 0} question row(s) and {report.surveysCount || 0} survey row(s)
            with mode = Correction or New Data.
          </p>
        </div>
      )}

      {genericError && (
        <div className="import-errors">
          <h3>Validation Failed</h3>
          <p style={{ marginBottom: genericError.details ? '0.75rem' : 0 }}>{formatError(genericError.error, 'Validation failed')}</p>
          {genericError.message && <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>{formatError(genericError.message)}</p>}
          {Array.isArray(genericError.details?.sheetsFound) && (
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-3)' }}>
              Sheets found in file: {genericError.details.sheetsFound.map(s => `"${s}"`).join(', ') || 'none'}
            </p>
          )}
        </div>
      )}

      {sourceErrors.length > 0 && (
        <div className="import-errors">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3>Validation Errors</h3>
              <p className="error-summary">
                Showing {filteredErrors.length} of {sourceErrors.length} issue(s).
                Validated against rows with mode = Correction or New Data.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={handleDownloadCsv}
              disabled={filteredErrors.length === 0}
            >
              Download CSV
            </button>
          </div>

          <div className="error-filter-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              className={`btn btn-sm ${errorFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setErrorFilter('all')}
            >
              All ({sourceErrors.length})
            </button>
            {surveyErrorCount > 0 && (
              <button
                className={`btn btn-sm ${errorFilter === 'survey' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setErrorFilter('survey')}
              >
                Survey ({surveyErrorCount})
              </button>
            )}
            {questionErrorCount > 0 && (
              <button
                className={`btn btn-sm ${errorFilter === 'question' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setErrorFilter('question')}
              >
                Question ({questionErrorCount})
              </button>
            )}
          </div>

          <div className="errors-table-container">
            <table className="errors-table">
              <thead>
                <tr>
                  <th>Survey ID</th>
                  <th>Type</th>
                  <th>Row</th>
                  <th>ID</th>
                  <th>Errors</th>
                </tr>
                <tr className="errors-table-filter-row">
                  {['surveyId', 'type', 'row', 'id', 'errors'].map(col => (
                    <th key={col}>
                      <input
                        type="text"
                        className="errors-table-filter-input"
                        placeholder="Filter…"
                        value={columnFilters[col]}
                        onChange={(e) => setColumnFilters(prev => ({ ...prev, [col]: e.target.value }))}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredErrors.map((error, idx) => (
                  <tr key={idx}>
                    <td><code>{error.surveyId || ''}</code></td>
                    <td><span className={`sheet-badge sheet-badge-${error.type}`}>{error.type}</span></td>
                    <td>{error.index ?? error.row ?? ''}</td>
                    <td><code>{error.questionId || error.surveyId || ''}</code></td>
                    <td>
                      <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
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
        </div>
      )}
    </div>
  );
};

export default DumpsheetValidator;
