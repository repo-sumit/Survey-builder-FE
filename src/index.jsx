import React from 'react';
import ReactDOM from 'react-dom/client';
// tokens.css MUST load first — it provides design-system custom
// properties (--brand, --surface-2, --r-*, etc.) used by the new
// ui primitives. App.css loads after and overrides any shared
// vars so legacy screens remain visually unchanged.
import './styles/tokens.css';
import './styles/ui.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
