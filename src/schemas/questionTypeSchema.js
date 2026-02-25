// Schema defining which fields are required/visible for each question type

export const questionTypes = [
  'Multiple Choice Single Select',
  'Multiple Choice Multi Select',
  'Tabular Text Input',
  'Tabular Drop Down',
  'Tabular Check Box',
  'Text Response',
  'Image Upload',
  'Video Upload',
  'Voice Response',
  'Likert Scale',
  'Calendar',
  'Drop Down'
];

export const textInputTypes = ['Numeric', 'Alphanumeric', 'Alphabets', 'None'];
export const questionMediaTypes = ['Image', 'Video', 'Audio', 'None'];
export const yesNoOptions = ['Yes', 'No'];

export const questionTypeFields = {
  'Multiple Choice Single Select': {
    showOptions: true,
    showOptionChildren: true,
    showTextInputType: false,
    showTableFields: false,
    showMaxMin: false,
    showTextLimit: false,
    textInputTypeValue: 'None',
    questionMediaTypeValue: 'None',
    isDynamic: 'Yes',
    maxOptions: 20
  },
  'Multiple Choice Multi Select': {
    showOptions: true,
    showOptionChildren: false,
    showTextInputType: false,
    showTableFields: false,
    showMaxMin: false,
    showTextLimit: false,
    textInputTypeValue: 'None',
    questionMediaTypeValue: 'None',
    isDynamic: 'Yes',
    maxOptions: 20
  },
  'Tabular Text Input': {
    showOptions: false,
    showOptionChildren: false,
    showTextInputType: true,
    showTableFields: true,
    showMaxMin: true,
    showTextLimit: false,
    isDynamic: 'No'
  },
  'Tabular Drop Down': {
    showOptions: true,
    showOptionChildren: false,
    showTextInputType: false,
    showTableFields: true,
    showMaxMin: false,
    showTextLimit: false,
    textInputTypeValue: 'None',
    isDynamic: 'Yes',
    maxOptions: 20
  },
  'Tabular Check Box': {
    showOptions: false,
    showOptionChildren: false,
    showTextInputType: false,
    showTableFields: true,
    showMaxMin: false,
    showTextLimit: false,
    isDynamic: 'No'
  },
  'Text Response': {
    showOptions: false,
    showOptionChildren: false,
    showTextInputType: true,
    showTableFields: false,
    showMaxMin: true,
    showTextLimit: true,
    isDynamic: 'Yes'
  },
  'Image Upload': {
    showOptions: false,
    showOptionChildren: false,
    showTextInputType: false,
    showTableFields: false,
    showMaxMin: false,
    showTextLimit: false,
    isDynamic: 'Yes'
  },
  'Video Upload': {
    showOptions: false,
    showOptionChildren: false,
    showTextInputType: false,
    showTableFields: false,
    showMaxMin: false,
    showTextLimit: false,
    isDynamic: 'No'
  },
  'Voice Response': {
    showOptions: false,
    showOptionChildren: false,
    showTextInputType: false,
    showTableFields: false,
    showMaxMin: false,
    showTextLimit: false,
    isDynamic: 'No'
  },
  'Likert Scale': {
    showOptions: true,
    showOptionChildren: false,
    showTextInputType: false,
    showTableFields: false,
    showMaxMin: false,
    showTextLimit: false,
    isDynamic: 'No',
    maxOptions: 20
  },
  'Calendar': {
    showOptions: false,
    showOptionChildren: false,
    showTextInputType: false,
    showTableFields: false,
    showMaxMin: false,
    showTextLimit: false,
    isDynamic: 'Yes'
  },
  'Drop Down': {
    showOptions: true,
    showOptionChildren: false,
    showTextInputType: false,
    showTableFields: false,
    showMaxMin: false,
    showTextLimit: false,
    isDynamic: 'Yes',
    maxOptions: 20
  }
};

export const getFieldsForQuestionType = (questionType) => {
  return questionTypeFields[questionType] || {
    showOptions: false,
    showOptionChildren: false,
    showTextInputType: false,
    showTableFields: false,
    showMaxMin: false,
    showTextLimit: false
  };
};
