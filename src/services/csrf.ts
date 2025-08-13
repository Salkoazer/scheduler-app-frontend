const API_URL = (() => {
  const isLocalhost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  return isLocalhost ? '/api' : (process.env.REACT_APP_API_URL || '/api');
})();

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function ensureCsrfToken(): Promise<string | null> {
  try {
    // Try reading existing cookie first
    const existing = getCookie('csrfToken');
    if (existing) return existing;
    await fetch(`${API_URL}/csrf`, { credentials: 'include' });
    return getCookie('csrfToken');
  } catch (e) {
    console.error('Failed to ensure CSRF token', e);
    return null;
  }
}

export async function csrfHeader(): Promise<Record<string, string>> {
  const token = await ensureCsrfToken();
  return token ? { 'X-CSRF-Token': token } : {};
}
