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

async function authenticateUser(username: string, password: string) {
    try {
        console.log(`Attempting to authenticate at: ${API_URL}/auth`);
        const response = await fetch(`${API_URL}/auth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
            credentials: 'include', // Ensure cookies are sent
        });

        if (!response.ok) {
            console.error('Authentication failed:', response.status, await response.text());
            return null;
        }

        const data = await response.json();
        console.log('Authentication response:', response.status);
        if (data?.token) {
            localStorage.setItem('token', data.token);
        }
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
        await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include', // Invalidate the cookie on the server
        });
        isAuthenticated = false;
    } catch (error) {
        console.error('Logout failed:', error);
    }
};