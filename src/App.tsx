import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
const Calendar = React.lazy(() => import('./components/Calendar'));
const NewReservation = React.lazy(() => import('./components/NewReservation'));
const ReservationDetail = React.lazy(() => import('./components/ReservationDetail') as Promise<{ default: React.ComponentType<{ locale: 'en' | 'pt' }> }>);
import { logout } from './services/auth';

const App: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [username, setUsername] = useState<string | null>(null);
    const [locale, setLocale] = useState<'en' | 'pt'>(() => {
        try {
            const stored = localStorage.getItem('appLocale');
            if (stored === 'pt' || stored === 'en') return stored;
        } catch {}
        return 'en';
    });
    const [lastActivity, setLastActivity] = useState(Date.now());

    const handleLogin = (username: string) => {
        setIsAuthenticated(true);
        setUsername(username);
        setLastActivity(Date.now());
    };

    const handleLogout = () => {
        logout();
        setIsAuthenticated(false);
        setUsername(null);
    };

    const toggleLocale = () => {
        setLocale(prev => {
            const next = prev === 'en' ? 'pt' : 'en';
            try { localStorage.setItem('appLocale', next); } catch {}
            return next;
        });
    };

    useEffect(() => {
        // In case locale was changed elsewhere (defensive)
        try { localStorage.setItem('appLocale', locale); } catch {}
    }, [locale]);

    const resetActivityTimer = () => {
        setLastActivity(Date.now());
    };

    useEffect(() => {
        const checkInactivity = () => {
            if (isAuthenticated && Date.now() - lastActivity > 15 * 60 * 1000) { // 15 minutes of inactivity
                handleLogout();
            }
        };

        const interval = setInterval(checkInactivity, 60 * 1000); // Check every minute

        const events = ['click', 'mousemove', 'keypress'];
        events.forEach(event => window.addEventListener(event, resetActivityTimer));

        return () => {
            clearInterval(interval);
            events.forEach(event => window.removeEventListener(event, resetActivityTimer));
        };
    }, [isAuthenticated, lastActivity]);

    return (
        <BrowserRouter>
            <div className="header">
                <div className="locale-toggle">
                    <button onClick={toggleLocale}>
                        {locale === 'en' ? 'PT' : 'EN'}
                    </button>
                </div>
                {isAuthenticated && (
                    <div className="user-info">
                        <span>{username}</span>
                        <button onClick={handleLogout}>Logout</button>
                    </div>
                )}
            </div>
            <React.Suspense fallback={<div>Loading…</div>}>
            <Routes>
                <Route 
                    path="/" 
                    element={
                        isAuthenticated ? 
                        <Navigate to="/calendar" replace /> : 
                        <Login onLogin={(username) => handleLogin(username)} locale={locale} />
                    } 
                />
                <Route 
                    path="/calendar" 
                    element={
                        isAuthenticated ? 
                        <Calendar locale={locale} /> : 
                        <Navigate to="/" replace />
                    } 
                />
                <Route 
                    path="/new-reservation" 
                    element={
                        isAuthenticated ? 
                        <NewReservation locale={locale} /> : 
                        <Navigate to="/" replace />
                    } 
                />
                <Route
                    path="/reservation/:id"
                    element={
                        isAuthenticated ?
                        <ReservationDetail locale={locale} /> :
                        <Navigate to="/" replace />
                    }
                />
            </Routes>
            </React.Suspense>
        </BrowserRouter>
    );
};

export default App;