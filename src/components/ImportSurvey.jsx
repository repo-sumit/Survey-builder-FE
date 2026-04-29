import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from './Toast';
import WaterAnimation from './WaterAnimation';

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

  // Combined source of validation errors: prefer the commit response when
  // available (it reflects what the server actually saw on the import attempt),
  // otherwise fall back to the preview's full error list.
  const sourceErrors = errors?.validationErrors || preview?.validationErrors || [];

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

  return (
    <div className="import-survey-container">

      {/* Page Header */}
      <div className="list-header">
        <div>
          <h2>Import Survey</h2>
          <p className="subtitle">Upload an XLSX or CSV file to import surveys and questions</p>
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

      {/* Instructions */}
      <div className="import-instructions">
        <h3>Import Instructions</h3>
        <ul>
          <li>Upload an XLSX file containing both <strong>Survey Master</strong> and <strong>Question Master</strong> sheets</li>
          <li>Or upload separate CSV files for Survey Master or Question Master</li>
          <li>Multi-language surveys are supported — questions with the same Survey_ID, Question_ID, and Question_Type will be grouped</li>
          <li>Click <strong>Preview</strong> first to see the parsed surveys; pick which ones to import</li>
          <li>By default, existing Survey IDs are rejected to prevent accidental data loss</li>
          <li>Enable overwrite only when you want to replace existing surveys and their questions</li>
        </ul>
      </div>

      {/* Upload Form */}
      <div className="admin-form-card">

        {/* Overwrite checkbox */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <input
            type="checkbox"
            id="overwriteCheck"
            checked={overwrite}
            onChange={e => setOverwrite(e.target.checked)}
            disabled={importing || previewing}
            style={{ marginTop: '0.2rem', width: 'auto', accentColor: 'var(--blue)', cursor: 'pointer', flexShrink: 0 }}
          />
          <div>
            <label
              htmlFor="overwriteCheck"
              style={{
                display: 'block', marginBottom: '0.2rem', cursor: 'pointer',
                fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)',
                textTransform: 'none', letterSpacing: 'normal',
              }}
            >
              Overwrite existing surveys with matching Survey IDs
            </label>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
              Unchecked: duplicates are rejected.&nbsp; Checked: matching surveys and questions are replaced.
            </span>
          </div>
        </div>

        {/* File input */}
        <div className="form-group">
          <label>
            Select File&nbsp;
            <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
              (XLSX, XLS or CSV)
            </span>
          </label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="file-input"
            disabled={importing || previewing}
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
            onClick={handlePreview}
            disabled={!file || previewing || importing}
          >
            {previewing ? 'Parsing…' : (preview ? 'Re-parse File' : 'Preview File')}
          </button>
          {preview && (
            <button
              className="btn btn-success btn-cta btn-icon-import"
              onClick={handleCommitImport}
              disabled={importing || previewing || selectedIds.size === 0 || selectedHaveErrors}
              title={selectedHaveErrors ? 'Fix or unselect surveys with errors first' : ''}
            >
              {importing ? 'Importing…' : `Import Selected (${selectedIds.size})`}
            </button>
          )}
        </div>
        <WaterAnimation active={previewing || importing} />
      </div>

      {/* Survey selection list */}
      {preview && preview.surveys && preview.surveys.length > 0 && (
        <div className="import-survey-picker">
          <div className="import-survey-picker-header">
            <h3>Select surveys to import</h3>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={toggleAll}
            >
              {selectedIds.size === preview.surveys.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <p className="error-summary" style={{ marginBottom: '0.75rem' }}>
            Found {preview.surveys.length} survey(s) and {preview.questions?.length || 0} question(s) in the file.
            {selectedHaveErrors && ' One or more selected surveys have validation errors — fix them or unselect those surveys before importing.'}
          </p>
          <div className="survey-checkbox-list">
            {preview.surveys.map(s => {
              const errCount = errorCountsBySurvey[s.surveyId] || 0;
              const checked = selectedIds.has(s.surveyId);
              return (
                <label key={s.surveyId} className={`survey-checkbox-row ${errCount > 0 ? 'has-errors' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSurvey(s.surveyId)}
                  />
                  <span className="survey-checkbox-id"><code>{s.surveyId}</code></span>
                  <span className="survey-checkbox-name">{s.surveyName || ''}</span>
                  {errCount > 0 && (
                    <span className="survey-checkbox-error-badge">
                      {errCount} error{errCount === 1 ? '' : 's'}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="import-success">
          <h3>Import Successful!</h3>
          <p>{result.surveysImported} survey(s) and {result.questionsImported} question(s) imported.</p>
        </div>
      )}

      {/* Generic Error (no validation errors) */}
      {errors && !errors.validationErrors && (
        <div className="import-errors">
          <h3>Import Failed</h3>
          <p style={{ marginBottom: errors.details ? '0.75rem' : 0 }}>{formatError(errors.error, 'Import failed')}</p>
          {errors.message && <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>{formatError(errors.message)}</p>}
          {Array.isArray(errors.details?.sheetsFound) && (
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-3)' }}>
              Sheets found in file: {errors.details.sheetsFound.map(s => `"${s}"`).join(', ') || 'none'}
            </p>
          )}
        </div>
      )}

      {/* Validation Errors */}
      {sourceErrors.length > 0 && (
        <div className="import-errors">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3>Validation Errors</h3>
              <p className="error-summary">
                Showing {filteredErrors.length} of {sourceErrors.length} issue(s)
                {selectedIds.size > 0 ? ' — filtered to selected survey(s).' : '.'}
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

          {/* Filter tabs */}
          <div className="error-filter-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              className={`btn btn-sm ${errorFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setErrorFilter('all')}
            >
              All ({visibleTotal})
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
                        placeholder="Search…"
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

export default ImportSurvey;
