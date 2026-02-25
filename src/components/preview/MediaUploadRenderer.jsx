import React from 'react';

const MediaUploadRenderer = ({ question, onChange }) => {
  const questionType = question.questionType;
  
  let acceptTypes = '*';
  let icon = '📁';
  let label = 'Upload File';
  
  if (questionType === 'Image Upload') {
    acceptTypes = 'image/*';
    icon = '📷';
    label = 'Upload Image';
  } else if (questionType === 'Video Upload') {
    acceptTypes = 'video/*';
    icon = '🎥';
    label = 'Upload Video';
  } else if (questionType === 'Voice Response') {
    acceptTypes = 'audio/*';
    icon = '🎤';
    label = 'Upload Audio';
  }

  return (
    <div className="media-upload-renderer">
      <div className="upload-placeholder">
        <div className="upload-icon">{icon}</div>
        <div className="upload-label">{label}</div>
        <input
          type="file"
          accept={acceptTypes}
          className="upload-input"
          onChange={(e) => onChange?.(e.target.files?.[0] || null)}
        />
      </div>
    </div>
  );
};

export default MediaUploadRenderer;
