import axios from 'axios';
import bcrypt from 'bcryptjs';

interface User {
    username: string;
    password: string;
}

let isAuthenticated = false;

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

async function authenticateUser(username: string, password: string) {
    try {
        const response = await axios.post(`${API_URL}/auth/authenticate`, { username, password });
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Authentication failed:', error.response ? error.response.data : error.message);
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