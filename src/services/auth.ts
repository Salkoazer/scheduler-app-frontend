import axios from 'axios';

interface User {
    username: string;
    password: string;
}

let isAuthenticated = false;

const API_URL = (() => {
    const url = process.env.REACT_APP_API_URL;
    console.log('Current API URL:', url || 'http://localhost:3000/api');
    return url || 'http://localhost:3000/api';
})();

async function authenticateUser(username: string, password: string) {
    try {
        console.log(`Attempting to authenticate at: ${API_URL}/auth`);
        const response = await axios.post(`${API_URL}/auth`, { username, password });
        console.log('Authentication response:', response.status);
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Authentication failed:', error.response?.status, error.response?.data);
            console.error('Request details:', {
                url: error.config?.url,
                method: error.config?.method,
                data: error.config?.data
            });
        } else {
            console.error('Authentication failed:', (error as Error).message);
        }
        return null;
    }
}

export const login = async (user: User): Promise<boolean> => {
    const authenticatedUser = await authenticateUser(user.username, user.password);
    if (authenticatedUser) {
        isAuthenticated = true;
        localStorage.setItem('token', authenticatedUser.token); // Store the token in local storage
        return true;
    }
    return false;
};

export const isLoggedIn = (): boolean => {
    return isAuthenticated;
};

export const logout = (): void => {
    isAuthenticated = false;
    localStorage.removeItem('token'); // Remove the token from local storage
};