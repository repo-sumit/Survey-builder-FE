import React, { useState } from 'react';
import { validationAPI } from '../services/api';

const UploadValidator = () => {
  const [file, setFile] = useState(null);
  const [schema, setSchema] = useState('both');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      const allowedTypes = ['.csv', '.xlsx', '.xls'];
      const fileName = selectedFile.name.toLowerCase();
      const isValid = allowedTypes.some(type => fileName.endsWith(type));
      
      if (!isValid) {
        setError('Please select a valid CSV or Excel file (.csv, .xlsx, .xls)');
        setFile(null);
        return;
      }
      
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleValidate = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await validationAPI.validateUpload(file, schema);
      setResult(response);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to validate file. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setSchema('both');
    setResult(null);
    setError(null);
    // Reset file input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
  };

  const downloadErrorsCSV = () => {
    if (!result || !result.errors || result.errors.length === 0) return;

    // Create CSV content
    const headers = [
      'Row #',
      'Sheet',
      'Survey ID',
      'Question ID',
      'Medium',
      'Question Type',
      'Field Name',
      'Error Message',
      'Invalid Value'
    ];
    const rows = result.errors.map(err => [
      err.row,
      err.sheet,
      err.surveyId || '',
      err.questionId || '',
      err.medium || '',
      err.questionType || '',
      err.field,
      err.message,
      err.value
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'validation_errors.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="form-container">
      <div className="form-header">
        <h2>Validate Upload (CSV/XLSX)</h2>
        <p className="subtitle">Upload your survey or question data file to validate against the schema</p>
      </div>

      {error && (
        <div className="error-message" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div className="upload-validator-form">
        <div className="form-section">
          <h3>File Selection</h3>
          
          <div className="form-group">
            <label htmlFor="fileInput">
              Select File <span className="required">*</span>
            </label>
            <input
              type="file"
              id="fileInput"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              disabled={loading}
              className="file-input"
            />
            <small>Accepted formats: CSV (.csv), Excel (.xlsx, .xls)</small>
            {file && (
              <div className="file-selected">
                <strong>Selected:</strong> {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="schemaSelect">
              Schema to Validate <span className="required">*</span>
            </label>
            <select
              id="schemaSelect"
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              disabled={loading}
            >
              <option value="both">Both (Survey Master & Question Master)</option>
              <option value="survey">Survey Master Only</option>
              <option value="question">Question Master Only</option>
            </select>
            <small>Select which schema to validate your data against</small>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClear}
              disabled={loading}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleValidate}
              disabled={!file || loading}
            >
              {loading ? 'Validating...' : 'Validate'}
            </button>
          </div>
        </div>

        {loading && (
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Validating your file, please wait...</p>
          </div>
        )}

        {result && !loading && (
          <div className="validation-results">
            <div className="form-section">
              <h3>Validation Results</h3>
              
              <div className="validation-summary">
                <div className={`summary-card ${result.isValid ? 'success' : 'error'}`}>
                  <div className="summary-icon">
                    {result.isValid ? '✓' : '⚠'}
                  </div>
                  <div className="summary-content">
                    <h4>{result.isValid ? 'All Rows Valid!' : 'Validation Errors Found'}</h4>
                    <div className="summary-stats">
                      <div className="stat">
                        <span className="stat-label">Total Rows:</span>
                        <span className="stat-value">{result.summary.totalRows}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Rows with Errors:</span>
                        <span className="stat-value">{result.summary.errorRows}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Total Errors:</span>
                        <span className="stat-value">{result.summary.totalErrors}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {result.isValid ? (
                <div className="success-state">
                  <div className="success-icon">✓</div>
                  <h3>All rows validated successfully!</h3>
                  <p>Your file contains no validation errors and is ready to be imported.</p>
                </div>
              ) : (
                <div className="errors-section">
                  <div className="errors-header">
                    <h4>Error Details</h4>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={downloadErrorsCSV}
                    >
                      Download Errors as CSV
                    </button>
                  </div>
                  
                  <div className="errors-table-container">
                    <table className="errors-table">
                      <thead>
                        <tr>
                          <th>Row #</th>
                          <th>Sheet</th>
                          <th>Survey ID</th>
                          <th>Question ID</th>
                          <th>Medium</th>
                          <th>Question Type</th>
                          <th>Field Name</th>
                          <th>Error Message</th>
                          <th>Invalid Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((err, idx) => (
                          <tr key={idx}>
                            <td>{err.row}</td>
                            <td><span className="sheet-badge">{err.sheet}</span></td>
                            <td>{err.surveyId || '-'}</td>
                            <td>{err.questionId || '-'}</td>
                            <td>{err.medium || '-'}</td>
                            <td>{err.questionType || '-'}</td>
                            <td><code>{err.field}</code></td>
                            <td>{err.message}</td>
                            <td className="error-value">{err.value || '(empty)'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadValidator;
