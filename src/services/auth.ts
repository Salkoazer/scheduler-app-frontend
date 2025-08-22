interface User {
    username: string;
    password: string;
}

let isAuthenticated = false;

const API_URL = (() => {
    const isLocalhost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    if (isLocalhost) {
        console.log('Current API URL (localhost): /api');
        return '/api';
    }
    const url = process.env.REACT_APP_API_URL;
    const fallback = '/api';
    console.log('Current API URL:', url || fallback);
    return url || fallback;
})();

import { csrfHeader, ensureCsrfToken } from './csrf';

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
    } catch (error) {
        console.error('Logout failed:', error);
    }
};

export const getSession = async (): Promise<{ username: string; role: 'admin' | 'staff' } | null> => {
    try {
        const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' });
        if (!res.ok) return null;
        return res.json();
    } catch (e) {
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