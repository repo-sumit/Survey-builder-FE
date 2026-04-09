import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from './Toast';

const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

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

const ImportSurvey = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [file, setFile]           = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState(null);
  const [errors, setErrors]       = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  const [errorFilter, setErrorFilter] = useState('all'); // 'all', 'survey', 'question'

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop().toLowerCase();
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        if (selectedFile.size > MAX_IMPORT_FILE_SIZE_BYTES) {
          setFile(null);
          setResult(null);
          setErrors({
            error: `File is too large. Maximum supported size is ${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024))} MB.`,
            message: 'Please split the workbook/CSV into smaller files and retry.'
          });
          e.target.value = '';
          return;
        }
        setFile(selectedFile);
        setErrors(null);
        setResult(null);
      } else {
        toast.error('Please select a valid XLSX or CSV file');
        e.target.value = '';
      }
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Please select a file to import');
      return;
    }

    try {
      setImporting(true);
      setErrors(null);
      setResult(null);
      setErrorFilter('all');

      const formData = new FormData();
      formData.append('file', file);

      const importUrl = overwrite ? '/api/import?overwrite=true' : '/api/import';
      const response = await axios.post(importUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
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
        // Structured error without validationErrors (e.g., missing sheets, parse errors)
        setErrors(normalizeApiErrorPayload(responseData, 'Import failed'));
      } else {
        setErrors({ error: formatError(err.message, 'Failed to import file') });
      }
    } finally {
      setImporting(false);
    }
  };

  const filteredErrors = errors?.validationErrors?.filter(e =>
    errorFilter === 'all' || e.type === errorFilter
  ) || [];

  const surveyErrorCount = errors?.validationErrors?.filter(e => e.type === 'survey').length || 0;
  const questionErrorCount = errors?.validationErrors?.filter(e => e.type === 'question').length || 0;

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
          <li>All data will be validated before import</li>
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
            disabled={importing}
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
            disabled={importing}
          />
          {file && (
            <div className="file-selected">
              <strong>Selected:</strong> {file.name}&nbsp;
              <span style={{ opacity: 0.75 }}>({(file.size / 1024).toFixed(2)} KB)</span>
            </div>
          )}
        </div>

        <button
          className="btn btn-primary btn-cta btn-icon-import"
          onClick={handleImport}
          disabled={!file || importing}
          style={{ marginTop: '0.5rem' }}
        >
          {importing ? 'Importing\u2026' : 'Import Survey'}
        </button>
      </div>

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
      {errors && errors.validationErrors && errors.validationErrors.length > 0 && (
        <div className="import-errors">
          <h3>Validation Errors</h3>
          <p className="error-summary">
            Found {errors.validationErrors.length} issue(s) across{' '}
            {errors.surveysCount} survey(s) and {errors.questionsCount} question(s).
            No data was imported.
          </p>

          {/* Filter tabs */}
          <div className="error-filter-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              className={`btn btn-sm ${errorFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setErrorFilter('all')}
            >
              All ({errors.validationErrors.length})
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
                  <th>Type</th>
                  <th>Row</th>
                  <th>ID</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {filteredErrors.map((error, idx) => (
                  <tr key={idx}>
                    <td><span className={`sheet-badge sheet-badge-${error.type}`}>{error.type}</span></td>
                    <td>{error.index}</td>
                    <td><code>{error.surveyId || error.questionId}</code></td>
                    <td>
                      <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
                        {error.errors.map((err, errIdx) => (
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
