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

  // Fallback: if running in browser and not localhost, assume same origin as page.
  // Default to localhost backend unless explicitly configured via env or window injection.
  // (Using window.origin caused 404s on static hosting like Amplify where no /api exists.)
  const defaultFallback = 'http://localhost:3000';
  let base = (candidates[0] || defaultFallback).trim();
  base = base.replace(/\/+$/, '');
  // Warn if we are on a non-localhost page but still using localhost fallback.
  try {
    if (typeof window !== 'undefined') {
      const hostIsLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
      if (!hostIsLocal && /^(http:\/\/)?localhost:3000$/.test(base)) {
        // Attempt smart heuristic: if site domain is calendariocoliseu.site (any subdomain), assume api subdomain.
        if (/calendariocoliseu\.site$/i.test(window.location.hostname)) {
          base = `${window.location.protocol}//api.calendariocoliseu.site`;
        } else {
          // eslint-disable-next-line no-console
          console.warn('[apiBase] Using localhost fallback on non-localhost host. Set REACT_APP_API_BASE_URL or window.__API_BASE_URL__ to your backend URL.');
        }
      }
    }
  } catch {}
  // eslint-disable-next-line no-console
  if (typeof window !== 'undefined') console.debug('[apiBase] resolved base =', base);
  return base;
}
