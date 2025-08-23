// Central API base resolution used by all service modules.
// Order of precedence: Vite env (VITE_API_BASE_URL) -> window injected -> legacy env vars -> default localhost.
export function getApiBase(): string {
  // Attempt to read env variables in a bundler-neutral, defensive way.
  let processEnv: any;
  try {
    // Some bundlers (webpack with DefinePlugin) inline process.env.*; others leave 'process' undefined in browser.
    processEnv = (typeof process !== 'undefined' && (process as any).env) ? (process as any).env : {};
  } catch {
    processEnv = {};
  }

  // Access import.meta.env only if present (Vite). In webpack it will be undefined.
  let viteEnv: any = {};
  try {
    viteEnv = (import.meta as any)?.env || {};
  } catch {
    viteEnv = {};
  }
  const windowInjected = (typeof window !== 'undefined' ? (window as any).__API_BASE_URL__ : undefined);

  const candidates = [
  viteEnv?.VITE_API_BASE_URL,
    windowInjected,
    processEnv.REACT_APP_API_BASE_URL,
    processEnv.API_BASE_URL
  ].filter(Boolean) as string[];

  let base = (candidates[0] || 'http://localhost:3000').trim();
  base = base.replace(/\/+$/, '');
  return base;
}
