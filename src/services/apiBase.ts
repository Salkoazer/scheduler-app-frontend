// Central API base resolution used by all service modules.
// Order of precedence: Vite env (VITE_API_BASE_URL) -> window injected -> legacy env vars -> default localhost.
export function getApiBase(): string {
  // Support Vite style and CRA style env variable names.
  const candidates = [
    (import.meta as any)?.env?.VITE_API_BASE_URL,
    (window as any).__API_BASE_URL__,
    (process as any)?.env?.REACT_APP_API_BASE_URL,
    (process as any)?.env?.API_BASE_URL
  ].filter(Boolean) as string[];
  let base = (candidates[0] || 'http://localhost:3000').trim();
  // Strip trailing slashes
  base = base.replace(/\/+$/, '');
  return base;
}
