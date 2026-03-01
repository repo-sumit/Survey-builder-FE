import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const ImportSurvey = () => {
  const navigate = useNavigate();
  const [file, setFile]         = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState(null);
  const [errors, setErrors]     = useState(null);
  const [overwrite, setOverwrite] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop().toLowerCase();
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        setFile(selectedFile);
        setErrors(null);
        setResult(null);
      } else {
        alert('Please select a valid XLSX or CSV file');
        e.target.value = '';
      }
    }
  };

  const handleImport = async () => {
    if (!file) {
      alert('Please select a file to import');
      return;
    }

    try {
      setImporting(true);
      setErrors(null);
      setResult(null);

      const formData = new FormData();
      formData.append('file', file);

      const importUrl = overwrite ? '/api/import?overwrite=true' : '/api/import';
      const response = await axios.post(importUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(response.data);
      alert(
        `Import successful! ${response.data.surveysImported} survey(s) and ${response.data.questionsImported} question(s) imported.`
      );

      if (response.data.surveys && response.data.surveys.length > 0) {
        const firstSurvey = response.data.surveys[0];
        setTimeout(() => {
          navigate(`/surveys/${firstSurvey.surveyId}/questions`);
        }, 1000);
      }
    } catch (err) {
      console.error('Import error:', err);
      if (err.response?.data?.validationErrors) {
        setErrors(err.response.data);
      } else {
        const errorMessage = err.response?.data?.error || 'Failed to import file';
        alert(errorMessage);
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="question-list-container">

      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="d-flex align-items-start justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="fw-bold mb-1" style={{ fontSize: '1.35rem' }}>Import Survey</h2>
          <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
            Upload an XLSX or CSV file to import surveys and questions
          </p>
        </div>
        <button
          className="btn btn-outline-secondary btn-sm fw-semibold"
          onClick={() => navigate('/')}
        >
          ← Back to Surveys
        </button>
      </div>

      {/* ── Instructions ─────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3 p-md-4">
          <h6 className="fw-bold mb-3" style={{ fontSize: '0.875rem' }}>
            📄 Import Instructions
          </h6>
          <ul className="mb-0" style={{ fontSize: '0.85rem', paddingLeft: '1.25rem', lineHeight: 1.7 }}>
            <li>Upload an XLSX file containing both <strong>Survey Master</strong> and <strong>Question Master</strong> sheets</li>
            <li>Or upload separate CSV files for Survey Master or Question Master</li>
            <li>Multi-language surveys are supported — questions with the same Survey_ID, Question_ID, and Question_Type will be grouped</li>
            <li>All data will be validated before import</li>
            <li>By default, existing Survey IDs are rejected to prevent accidental data loss</li>
            <li>Enable overwrite only when you want to replace existing surveys and their questions</li>
          </ul>
        </div>
      </div>

      {/* ── Upload Form ──────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3 p-md-4">

          {/* Overwrite checkbox */}
          <div className="mb-4">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="overwriteCheck"
                checked={overwrite}
                onChange={e => setOverwrite(e.target.checked)}
                disabled={importing}
              />
              <label
                className="form-check-label fw-semibold"
                htmlFor="overwriteCheck"
                style={{ fontSize: '0.875rem' }}
              >
                Overwrite existing surveys with matching Survey IDs
              </label>
            </div>
            <p className="text-muted mb-0 ps-4" style={{ fontSize: '0.78rem' }}>
              Unchecked: duplicates are rejected.&nbsp; Checked: matching surveys and questions are replaced.
            </p>
          </div>

          {/* File input */}
          <div className="mb-4">
            <label className="form-label fw-semibold" style={{ fontSize: '0.82rem' }}>
              Select File
              <span className="text-muted fw-normal ms-1">(XLSX, XLS or CSV)</span>
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="form-control"
              disabled={importing}
            />
            {file && (
              <div
                className="mt-2 px-3 py-2 rounded"
                style={{
                  background: 'var(--bs-success-bg-subtle, #d1e7dd)',
                  fontSize: '0.82rem',
                }}
              >
                <strong>Selected:</strong> {file.name}&nbsp;
                <span className="text-muted">({(file.size / 1024).toFixed(2)} KB)</span>
              </div>
            )}
          </div>

          <button
            className="btn btn-primary fw-semibold"
            onClick={handleImport}
            disabled={!file || importing}
          >
            {importing ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" />
                Importing…
              </>
            ) : 'Import Survey'}
          </button>
        </div>
      </div>

      {/* ── Success ──────────────────────────────────────────────── */}
      {result && (
        <div
          className="alert alert-success d-flex align-items-center gap-2 mb-4"
          style={{ fontSize: '0.875rem' }}
        >
          <span style={{ fontSize: '1.1rem' }}>✓</span>
          <div>
            <strong>Import Successful!</strong>{' '}
            {result.surveysImported} survey(s) and {result.questionsImported} question(s) imported.
          </div>
        </div>
      )}

      {/* ── Validation Errors ────────────────────────────────────── */}
      {errors && errors.validationErrors && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-3 p-md-4">
            <h6 className="fw-bold text-danger mb-1" style={{ fontSize: '0.875rem' }}>
              ⚠ Validation Errors
            </h6>
            <p className="text-muted mb-3" style={{ fontSize: '0.82rem' }}>
              Found {errors.validationErrors.length} error(s) in{' '}
              {errors.surveysCount} survey(s) and {errors.questionsCount} question(s)
            </p>
            <div className="table-responsive">
              <table className="table table-hover table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ fontSize: '0.78rem' }}>Type</th>
                    <th style={{ fontSize: '0.78rem' }}>Index</th>
                    <th style={{ fontSize: '0.78rem' }}>ID</th>
                    <th style={{ fontSize: '0.78rem' }}>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.validationErrors.map((error, idx) => (
                    <tr key={idx}>
                      <td>
                        <span
                          className="badge bg-danger-subtle text-danger"
                          style={{ fontSize: '0.72rem' }}
                        >
                          {error.type}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{error.index}</td>
                      <td>
                        <code style={{ fontSize: '0.78rem' }}>
                          {error.surveyId || error.questionId}
                        </code>
                      </td>
                      <td>
                        <ul className="mb-0" style={{ paddingLeft: '1.2rem', fontSize: '0.82rem' }}>
                          {error.errors.map((err, errIdx) => (
                            <li key={errIdx}>{err}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ImportSurvey;
