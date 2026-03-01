import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const ImportSurvey = () => {
  const navigate = useNavigate();
  const [file, setFile]           = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState(null);
  const [errors, setErrors]       = useState(null);
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
    <div className="import-survey-container">

      {/* ── Page Header ── */}
      <div className="list-header">
        <div>
          <h2>Import Survey</h2>
          <p className="subtitle">Upload an XLSX or CSV file to import surveys and questions</p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/')}
          >
            ← Back to Surveys
          </button>
        </div>
      </div>

      {/* ── Instructions ── */}
      <div className="import-instructions">
        <h3>📄 Import Instructions</h3>
        <ul>
          <li>Upload an XLSX file containing both <strong>Survey Master</strong> and <strong>Question Master</strong> sheets</li>
          <li>Or upload separate CSV files for Survey Master or Question Master</li>
          <li>Multi-language surveys are supported — questions with the same Survey_ID, Question_ID, and Question_Type will be grouped</li>
          <li>All data will be validated before import</li>
          <li>By default, existing Survey IDs are rejected to prevent accidental data loss</li>
          <li>Enable overwrite only when you want to replace existing surveys and their questions</li>
        </ul>
      </div>

      {/* ── Upload Form ── */}
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
          className="btn btn-primary"
          onClick={handleImport}
          disabled={!file || importing}
          style={{ marginTop: '0.5rem' }}
        >
          {importing ? 'Importing…' : 'Import Survey'}
        </button>
      </div>

      {/* ── Success ── */}
      {result && (
        <div className="import-success">
          <h3>✓ Import Successful!</h3>
          <p>{result.surveysImported} survey(s) and {result.questionsImported} question(s) imported.</p>
        </div>
      )}

      {/* ── Validation Errors ── */}
      {errors && errors.validationErrors && (
        <div className="import-errors">
          <h3>⚠ Validation Errors</h3>
          <p className="error-summary">
            Found {errors.validationErrors.length} error(s) in{' '}
            {errors.surveysCount} survey(s) and {errors.questionsCount} question(s)
          </p>
          <div className="errors-table-container">
            <table className="errors-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Index</th>
                  <th>ID</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {errors.validationErrors.map((error, idx) => (
                  <tr key={idx}>
                    <td><span className="sheet-badge">{error.type}</span></td>
                    <td>{error.index}</td>
                    <td><code>{error.surveyId || error.questionId}</code></td>
                    <td>
                      <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
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
      )}

    </div>
  );
};

export default ImportSurvey;
