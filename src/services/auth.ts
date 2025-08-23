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
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes; server validation runs anyway

interface CachedSession { v: number; username: string; role: 'admin' | 'staff'; ts: number }

export function loadCachedSession(): { username: string; role: 'admin' | 'staff' } | null {
    try {
        const raw = (typeof window !== 'undefined') ? window.sessionStorage.getItem(SESSION_STORAGE_KEY) : null;
        if (!raw) return null;
        const parsed: CachedSession = JSON.parse(raw);
        if (parsed.v !== SESSION_VERSION) return null;
        if (Date.now() - parsed.ts > SESSION_TTL_MS) return null; // expired
        return { username: parsed.username, role: parsed.role };
    } catch { return null; }
}

function persistSession(username: string, role: 'admin' | 'staff') {
    try {
        if (typeof window === 'undefined') return;
        const payload: CachedSession = { v: SESSION_VERSION, username, role, ts: Date.now() };
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
}

export function clearCachedSession() {
    try { if (typeof window !== 'undefined') window.sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch {}
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
    const attempt = async (): Promise<{ username: string; role: 'admin' | 'staff' } | null> => {
        try {
            const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' });
            if (!res.ok) return null;
            return res.json();
        } catch { return null; }
    };
    let sess = await attempt();
    if (!sess) {
        // Try refresh flow (silent) if refresh cookie exists (we cannot directly read it; just attempt)
        try {
            await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
        } catch {}
        sess = await attempt();
    }
    if (sess) {
        persistSession(sess.username, sess.role);
        return sess;
    } else {
        clearCachedSession();
        return null;
    }
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