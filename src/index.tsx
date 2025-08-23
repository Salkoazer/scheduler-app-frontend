import React from 'react';
// Declare injected compile-time constant for TypeScript
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __APP_API_BASE__: string | undefined;
import { createRoot } from 'react-dom/client';
import App from './App';
import { getApiBase } from './services/apiBase';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  // Log resolved API base once at startup for debugging production misconfig.
  // eslint-disable-next-line no-console
  console.info('[bootstrap] API base =', getApiBase());
  // Log commit metadata if available (Amplify injects AWS_COMMIT_ID/AWS_BRANCH envs)
  try {
    // eslint-disable-next-line no-console
    console.info('[bootstrap] commit:', (typeof process !== 'undefined' && (process as any)?.env?.AWS_COMMIT_ID) || 'unknown', 'branch:', (typeof process !== 'undefined' && (process as any)?.env?.AWS_BRANCH) || 'unknown');
  } catch {}
  // Log the raw injected constant (double-check) if present
  // eslint-disable-next-line no-console
  if (typeof __APP_API_BASE__ !== 'undefined' && __APP_API_BASE__) console.info('[bootstrap] __APP_API_BASE__ =', __APP_API_BASE__);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}