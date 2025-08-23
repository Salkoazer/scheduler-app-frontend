import { getApiBase } from './apiBase';
interface User { username: string; password: string; }
let isAuthenticated = false;
// Centralized API base (absolute) then append /api (backend prefix)
const API_BASE = getApiBase();
const API_URL = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;
if (typeof window !== 'undefined' && (window as any).__DEBUG_API_BASE__ && API_BASE) {
    // Optional hook to debug at runtime
    console.log('[auth] API base =', API_URL);
}

import { csrfHeader, ensureCsrfToken } from './csrf';

// Lightweight client-side session cache (non-sensitive: username & role only)
// We include a version and short TTL so stale data (e.g., renamed user) self-expires quickly.
const SESSION_STORAGE_KEY = 'appSessionCache';
const SESSION_VERSION = 1;
// Extend TTL so username persists across typical workday refreshes (8h)
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface CachedSession { v: number; username: string; role: 'admin' | 'staff'; ts: number }

export function loadCachedSession(): { username: string; role: 'admin' | 'staff'; stale?: boolean } | null {
    try {
        const raw = (typeof window !== 'undefined') ? (window.localStorage.getItem(SESSION_STORAGE_KEY) || window.sessionStorage.getItem(SESSION_STORAGE_KEY)) : null;
        if (!raw) return null;
        const parsed: CachedSession = JSON.parse(raw);
        if (parsed.v !== SESSION_VERSION) return null;
        const age = Date.now() - parsed.ts;
        if (age > SESSION_TTL_MS) {
            // Return as stale so UI can still show last known username while validation runs
            return { username: parsed.username, role: parsed.role, stale: true };
        }
        return { username: parsed.username, role: parsed.role };
    } catch { return null; }
}

function persistSession(username: string, role: 'admin' | 'staff') {
    try {
        if (typeof window === 'undefined') return;
        const payload: CachedSession = { v: SESSION_VERSION, username, role, ts: Date.now() };
        // Prefer localStorage for cross-tab & long-lived persistence; fall back to sessionStorage if quota issues.
        try {
            window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
        } catch {
            window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
        }
    } catch {}
}

export function clearCachedSession() {
    try { if (typeof window !== 'undefined') { window.localStorage.removeItem(SESSION_STORAGE_KEY); window.sessionStorage.removeItem(SESSION_STORAGE_KEY); } } catch {}
}

async function authenticateUser(username: string, password: string) {
    try {
    console.log(`Attempting to authenticate at: ${API_URL}/auth`);
        await ensureCsrfToken();
        const headers: any = {
            'Content-Type': 'application/json',
            ...(await csrfHeader())
        };
        const response = await fetch(`${API_URL}/auth`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ username, password }),
            credentials: 'include', // Ensure cookies are sent
        });

        if (!response.ok) {
            console.error('Authentication failed:', response.status, await response.text());
            return null;
        }

    const data = await response.json();
    console.log('Authentication response:', response.status);
    return data; // includes role & username
    } catch (error) {
        console.error('Authentication failed:', error);
        return null;
    }
}

export const login = async (user: User): Promise<{ success: boolean; role?: 'admin' | 'staff'; username?: string }> => {
    const authenticatedUser = await authenticateUser(user.username, user.password);
    if (authenticatedUser) {
        isAuthenticated = true;
    persistSession(authenticatedUser.username, authenticatedUser.role);
    return { success: true, role: authenticatedUser.role, username: authenticatedUser.username };
    }
    return { success: false };
};

export const isLoggedIn = (): boolean => {
    return isAuthenticated;
};

export const logout = async (): Promise<void> => {
    try {
        const headers: any = await csrfHeader();
        await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include', // Invalidate the cookie on the server
            headers,
        });
        isAuthenticated = false;
        clearCachedSession();
    } catch (error) {
        console.error('Logout failed:', error);
    }
};

export const getSession = async (): Promise<{ username: string; role: 'admin' | 'staff' } | null> => {
    // Attempt direct validation; on 401 try refresh then retry once.
    const attempt = async () => {
        try {
            const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' });
            if (res.status === 401) return { state: 'unauthorized' as const };
            if (!res.ok) return { state: 'error' as const };
            const data = await res.json();
            return { state: 'ok' as const, data };
        } catch { return { state: 'error' as const }; }
    };
    let first = await attempt();
    if (first.state === 'ok') {
        persistSession(first.data.username, first.data.role);
        return first.data;
    }
    if (first.state === 'unauthorized') {
        // Try silent refresh then re-attempt
        let refreshData = null;
        try {
            const refreshRes = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
            if (refreshRes.ok) {
                const refreshJson = await refreshRes.json();
                if (refreshJson && refreshJson.username && refreshJson.role) {
                    refreshData = { username: refreshJson.username, role: refreshJson.role };
                    persistSession(refreshJson.username, refreshJson.role);
                }
            }
        } catch {}
        const second = await attempt();
        if (second.state === 'ok') {
            persistSession(second.data.username, second.data.role);
            return second.data;
        }
        if (refreshData) {
            return refreshData;
        }
        if (second.state === 'unauthorized') {
            clearCachedSession();
            return null; // confirmed unauthorized
        }
        // transient error after unauthorized -> keep stale cache (do not clear)
        return loadCachedSession();
    }
    // first attempt transient error (network/server). Keep stale cache if present.
    const cached = loadCachedSession();
    if (cached) return { username: cached.username, role: cached.role };
    return null;
};

// Robust variant returning state to let caller decide whether to clear UI.
export const getSessionRobust = async (): Promise<{ session: { username: string; role: 'admin' | 'staff' } | null; state: 'ok' | 'unauthorized' | 'error' }> => {
    const attempt = async () => {
        try {
            const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' });
            if (res.status === 401) return { state: 'unauthorized' as const };
            if (!res.ok) return { state: 'error' as const };
            const data = await res.json();
            return { state: 'ok' as const, data };
        } catch { return { state: 'error' as const }; }
    };
    let first = await attempt();
    if (first.state === 'ok') {
        persistSession(first.data.username, first.data.role);
        return { session: first.data, state: 'ok' };
    }
    if (first.state === 'unauthorized') {
        let refreshData = null;
        try {
            const refreshRes = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
            if (refreshRes.ok) {
                const refreshJson = await refreshRes.json();
                if (refreshJson && refreshJson.username && refreshJson.role) {
                    refreshData = { username: refreshJson.username, role: refreshJson.role };
                    persistSession(refreshJson.username, refreshJson.role);
                }
            }
        } catch {}
        const second = await attempt();
        if (second.state === 'ok') {
            persistSession(second.data.username, second.data.role);
            return { session: second.data, state: 'ok' };
        }
        if (refreshData) {
            return { session: refreshData, state: 'ok' };
        }
        if (second.state === 'unauthorized') {
            clearCachedSession();
            return { session: null, state: 'unauthorized' };
        }
        // transient after unauthorized
        const cached = loadCachedSession();
        if (cached) return { session: { username: cached.username, role: cached.role }, state: 'error' };
        return { session: null, state: 'error' };
    }
    // transient server/network error
    const cached = loadCachedSession();
    if (cached) return { session: { username: cached.username, role: cached.role }, state: 'error' };
    return { session: null, state: 'error' };
};

export const createUser = async (username: string, password: string, role: 'admin' | 'staff') => {
    const headers: any = await csrfHeader();
    headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API_URL}/auth/create`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ username, password, role })
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed creating user');
    }
    return res.json();
};

export interface ManagedUser { username: string; role: 'admin' | 'staff'; createdAt?: string }

export const listUsers = async (): Promise<ManagedUser[]> => {
    const res = await fetch(`${API_URL}/auth/users`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load users');
    return res.json();
};

export const updateUser = async (username: string, payload: { newUsername?: string; password?: string; role?: 'admin' | 'staff' }) => {
    const headers: any = await csrfHeader();
    headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API_URL}/auth/users/${encodeURIComponent(username)}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text() || 'Failed updating user');
    return res.json();
};

export const deleteUser = async (username: string) => {
    const headers: any = await csrfHeader();
    const res = await fetch(`${API_URL}/auth/users/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
    });
    if (!res.ok) throw new Error(await res.text() || 'Failed deleting user');
    return res.json();
};