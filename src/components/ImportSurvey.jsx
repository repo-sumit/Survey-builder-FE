import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importAPI } from '../services/api';

const ImportSurvey = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState(null);
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

      const response = await importAPI.importFile(file, overwrite);

      setResult(response);
      alert(`Import successful! ${response.surveysImported} survey(s) and ${response.questionsImported} question(s) imported.`);
      
      // Navigate to the first imported survey if available
      if (response.surveys && response.surveys.length > 0) {
        const firstSurvey = response.surveys[0];
        setTimeout(() => {
          navigate(`/surveys/${firstSurvey.surveyId}/questions`);
        }, 1000);
      }
    } catch (err) {
      console.error('Import error:', err);
      
      if (err.response?.data?.validationErrors) {
        setErrors(err.response.data);
      } else {
        const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Failed to import file';
        alert(errorMessage);
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="import-survey-container">
      <div className="form-container">
        <div className="form-header">
          <h2>Import Survey</h2>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/')}
          >
            Back to Surveys
          </button>
        </div>

        <div className="import-instructions">
          <h3>Import Instructions</h3>
          <ul>
            <li>Upload an XLSX file containing both Survey Master and Question Master sheets</li>
            <li>Or upload separate CSV files for Survey Master or Question Master</li>
            <li>Multi-language surveys are supported - questions with the same Survey_ID, Question_ID, and Question_Type will be grouped</li>
            <li>All data will be validated before import</li>
            <li>By default, existing Survey IDs are rejected to prevent accidental data loss</li>
            <li>Enable overwrite only when you want to replace existing surveys and their questions</li>
          </ul>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              disabled={importing}
            />
            Overwrite existing surveys with matching Survey IDs
          </label>
          <small>Unchecked: duplicates are rejected. Checked: matching surveys and questions are replaced.</small>
        </div>

        <div className="form-group">
          <label>Select File</label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="file-input"
          />
          {file && (
            <div className="file-selected">
              <strong>Selected file:</strong> {file.name} ({(file.size / 1024).toFixed(2)} KB)
            </div>
          )}
        </div>

        <div className="form-actions">
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={!file || importing}
          >
            {importing ? 'Importing...' : 'Import Survey'}
          </button>
        </div>

        {result && (
          <div className="import-success">
            <h3>&#x2713; Import Successful</h3>
            <p>Surveys imported: {result.surveysImported}</p>
            <p>Questions imported: {result.questionsImported}</p>
          </div>
        )}

        {errors && errors.validationErrors && (
          <div className="import-errors">
            <h3>Validation Errors</h3>
            <p className="error-summary">
              Found {errors.validationErrors.length} error(s) in {errors.surveysCount} survey(s) and {errors.questionsCount} question(s)
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
                      <td>
                        <span className="sheet-badge">{error.type}</span>
                      </td>
                      <td>{error.index}</td>
                      <td>
                        <code>{error.surveyId || error.questionId}</code>
                      </td>
                      <td>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
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
    </div>
  );
};

export default ImportSurvey;
