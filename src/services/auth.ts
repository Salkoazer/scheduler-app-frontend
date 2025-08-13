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
    // Cookie is set by server; avoid storing token in localStorage
    return data;
    } catch (error) {
        console.error('Authentication failed:', error);
        return null;
    }
}

export const login = async (user: User): Promise<boolean> => {
    const authenticatedUser = await authenticateUser(user.username, user.password);
    if (authenticatedUser) {
        isAuthenticated = true;
        return true;
    }
    return false;
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