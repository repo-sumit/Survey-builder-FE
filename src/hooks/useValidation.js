import { useState } from 'react';
import {
  AVAILABLE_MEDIUMS,
  YES_NO_VALUES,
  MODES,
  PATTERNS,
  CONSTRAINTS,
  MESSAGES
} from '../schemas/validationConstants';

export const useValidation = () => {
  const [errors, setErrors] = useState({});

  const validateSurvey = (surveyData) => {
    const newErrors = {};

    // Survey ID validation
    if (!surveyData.surveyId || surveyData.surveyId.trim() === '') {
      newErrors.surveyId = MESSAGES.REQUIRED('Survey ID');
    } else if (!PATTERNS.SURVEY_ID.test(surveyData.surveyId)) {
      newErrors.surveyId = 'Survey ID must contain only alphanumeric characters and underscores (no spaces)';
    }
    
    // Survey Name validation
    if (!surveyData.surveyName || surveyData.surveyName.trim() === '') {
      newErrors.surveyName = MESSAGES.REQUIRED('Survey Name');
    } else if (surveyData.surveyName.length > CONSTRAINTS.SURVEY_NAME_MAX) {
      newErrors.surveyName = MESSAGES.MAX_LENGTH('Survey Name', CONSTRAINTS.SURVEY_NAME_MAX);
    }
    
    // Survey Description validation
    if (!surveyData.surveyDescription || surveyData.surveyDescription.trim() === '') {
      newErrors.surveyDescription = MESSAGES.REQUIRED('Survey Description');
    } else if (surveyData.surveyDescription.length > CONSTRAINTS.SURVEY_DESCRIPTION_MAX) {
      newErrors.surveyDescription = MESSAGES.MAX_LENGTH('Survey Description', CONSTRAINTS.SURVEY_DESCRIPTION_MAX);
    }

    // Available Mediums validation
    if (!surveyData.availableMediums || surveyData.availableMediums.length === 0) {
      newErrors.availableMediums = MESSAGES.REQUIRED('Available Mediums');
    } else {
      const mediums = Array.isArray(surveyData.availableMediums) 
        ? surveyData.availableMediums 
        : surveyData.availableMediums.split(',').map(m => m.trim());
      
      for (const medium of mediums) {
        if (!AVAILABLE_MEDIUMS.includes(medium)) {
          newErrors.availableMediums = MESSAGES.ENUM_MISMATCH('Available Mediums', AVAILABLE_MEDIUMS);
          break;
        }
      }
    }

    // Hierarchical Access Level validation (optional field)
    if (surveyData.hierarchicalAccessLevel && surveyData.hierarchicalAccessLevel.trim() !== '') {
      const levels = surveyData.hierarchicalAccessLevel.split(',').map(l => l.trim()).filter(l => l);
      
      // Check all are numeric
      for (const level of levels) {
        if (!/^\d+$/.test(level)) {
          newErrors.hierarchicalAccessLevel = MESSAGES.HIERARCHY_NUMERIC;
          break;
        }
        const num = parseInt(level);
        if (num < CONSTRAINTS.HIERARCHY_LEVEL_MIN || num > CONSTRAINTS.HIERARCHY_LEVEL_MAX) {
          newErrors.hierarchicalAccessLevel = `Hierarchical Access Level values must be between ${CONSTRAINTS.HIERARCHY_LEVEL_MIN} and ${CONSTRAINTS.HIERARCHY_LEVEL_MAX}`;
          break;
        }
      }

      // Check for duplicates
      if (!newErrors.hierarchicalAccessLevel) {
        const uniqueLevels = [...new Set(levels)];
        if (uniqueLevels.length !== levels.length) {
          newErrors.hierarchicalAccessLevel = MESSAGES.HIERARCHY_DUPLICATE;
        }
      }
    }

    // Yes/No fields validation
    const yesNoFields = [
      'public', 'inSchool', 'acceptMultipleEntries', 'isActive', 
      'downloadResponse', 'geoFencing', 'geoTagging', 'testSurvey', 'visibleOnReportBot'
    ];
    
    yesNoFields.forEach(field => {
      if (surveyData[field] && !YES_NO_VALUES.includes(surveyData[field])) {
        newErrors[field] = `${field} must be "Yes" or "No"`;
      }
    });

    // Mode validation
    if (surveyData.mode && !MODES.includes(surveyData.mode)) {
      newErrors.mode = MESSAGES.ENUM_MISMATCH('Mode', MODES);
    }

    // Geo Fencing/Tagging cross-validation
    if (surveyData.geoFencing === 'Yes' && surveyData.geoTagging !== 'Yes') {
      newErrors.geoTagging = MESSAGES.GEO_FENCING_TAGGING;
    }

    // Date format validation
    if (surveyData.launchDate && !isValidDateFormat(surveyData.launchDate)) {
      newErrors.launchDate = MESSAGES.DATE_INVALID;
    }
    if (surveyData.closeDate && !isValidDateFormat(surveyData.closeDate)) {
      newErrors.closeDate = MESSAGES.DATE_INVALID;
    }
    
    // Date comparison: Close Date >= Launch Date
    if (surveyData.launchDate && surveyData.closeDate && 
        isValidDateFormat(surveyData.launchDate) && isValidDateFormat(surveyData.closeDate)) {
      const launchDate = parseDateString(surveyData.launchDate);
      const closeDate = parseDateString(surveyData.closeDate);
      if (closeDate < launchDate) {
        newErrors.closeDate = MESSAGES.DATE_COMPARE;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateQuestion = (questionData, questionType) => {
    const newErrors = {};

    if (!questionData.questionId || questionData.questionId.trim() === '') {
      newErrors.questionId = MESSAGES.REQUIRED('Question ID');
    } else if (!PATTERNS.QUESTION_ID.test(questionData.questionId)) {
      newErrors.questionId = 'Question ID must be in format 1, 1.1, 5.2 (saved as Q1, Q1.1, Q5.2).';
    }
    
    if (!questionData.questionDescription || questionData.questionDescription.trim() === '') {
      newErrors.questionDescription = MESSAGES.REQUIRED('Question Description');
    } else if (questionData.questionDescription.length > CONSTRAINTS.QUESTION_DESCRIPTION_MAX) {
      newErrors.questionDescription = MESSAGES.MAX_LENGTH('Question Description', CONSTRAINTS.QUESTION_DESCRIPTION_MAX);
    }

    // Validate based on question type
    const tabularTypes = ['Tabular Text Input', 'Tabular Drop Down', 'Tabular Check Box'];
    if (tabularTypes.includes(questionType)) {
      if (!questionData.tableHeaderValue || questionData.tableHeaderValue.trim() === '') {
        newErrors.tableHeaderValue = 'Table Header Value is required for tabular questions';
      }
      if (!questionData.tableQuestionValue || questionData.tableQuestionValue.trim() === '') {
        newErrors.tableQuestionValue = 'Table Question Value is required for tabular questions';
      } else {
        // Validate format
        if (!validateTableQuestionFormat(questionData.tableQuestionValue)) {
          newErrors.tableQuestionValue = 'Format must be: a:Question 1\\nb:Question 2';
        }
      }
    }

    const multipleChoiceTypes = [
      'Multiple Choice Single Select',
      'Multiple Choice Multi Select',
      'Drop Down',
      'Likert Scale',
      'Tabular Drop Down'
    ];
    if (multipleChoiceTypes.includes(questionType)) {
      if (!questionData.options || questionData.options.length === 0) {
        newErrors.options = 'At least one option is required';
      } else if (questionData.options.length > CONSTRAINTS.OPTION_MAX) {
        newErrors.options = `Maximum ${CONSTRAINTS.OPTION_MAX} options allowed`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidDateFormat = (dateString) => {
    if (!dateString) return false;
    return PATTERNS.DATE_FORMAT.test(dateString);
  };

  const parseDateString = (dateString) => {
    // Parse DD/MM/YYYY HH:MM:SS or DD/MM/YYYY format
    const [datePart, timePart] = dateString.split(' ');
    const [day, month, year] = datePart.split('/').map(Number);
    
    if (timePart) {
      const [hours, minutes, seconds] = timePart.split(':').map(Number);
      return new Date(year, month - 1, day, hours, minutes, seconds);
    } else {
      return new Date(year, month - 1, day);
    }
  };

  const validateTableQuestionFormat = (value) => {
    return PATTERNS.TABLE_QUESTION_FORMAT.test(value);
  };

  const clearErrors = () => {
    setErrors({});
  };

  return {
    errors,
    validateSurvey,
    validateQuestion,
    clearErrors,
    setErrors
  };
};
