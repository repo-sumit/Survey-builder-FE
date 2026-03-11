import React, { useState } from 'react';

const MediaUploadRenderer = ({ question, onChange }) => {
  const [fileName, setFileName] = useState('');
  const questionType = question.questionType;

  let acceptTypes = '*';
  let uploadLabel = 'Upload File';

  if (questionType === 'Image Upload') {
    acceptTypes = 'image/*';
    uploadLabel = 'Upload Image';
  } else if (questionType === 'Video Upload') {
    acceptTypes = 'video/*';
    uploadLabel = 'Upload Video';
  } else if (questionType === 'Voice Response') {
    acceptTypes = 'audio/*';
    uploadLabel = 'Upload Audio';
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setFileName(file ? file.name : '');
    onChange?.(file);
  };

  return (
    <div className="media-upload-renderer">
      <label className="upload-area-label">
        <div className="upload-area-inner">
          <div className="upload-icon-stack">
            <span className="upload-icon-image">🖼️</span>
            <span className="upload-icon-video">🎬</span>
            <div className="upload-arrow-circle">
              <span className="upload-arrow-up">↑</span>
            </div>
          </div>
          <span className="upload-tap-text">Tap to Upload</span>
          {fileName && <span className="upload-file-name">{fileName}</span>}
        </div>
        <input
          type="file"
          accept={acceptTypes}
          className="upload-file-hidden"
          onChange={handleFileChange}
        />
      </label>
      <p className="upload-type-label">{uploadLabel}</p>
    </div>
  );
};

export default MediaUploadRenderer;
