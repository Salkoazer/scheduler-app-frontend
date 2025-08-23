import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getApiBase } from './services/apiBase';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  // Log resolved API base once at startup for debugging production misconfig.
  // eslint-disable-next-line no-console
  console.info('[bootstrap] API base =', getApiBase());
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}