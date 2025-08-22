import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
const Calendar = React.lazy(() => import('./components/Calendar'));
const NewReservation = React.lazy(() => import('./components/NewReservation'));
const ReservationDetail = React.lazy(() => import('./components/ReservationDetail') as Promise<{ default: React.ComponentType<{ locale: 'en' | 'pt'; username?: string | null; role?: 'admin' | 'staff' | null }> }>);
import { logout, getSession, createUser, listUsers, updateUser, deleteUser } from './services/auth';

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
    const [role, setRole] = useState<'admin' | 'staff' | null>(null);
    const [showAccountMgmt, setShowAccountMgmt] = useState(false);
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'staff' as 'staff' | 'admin' });
    const [users, setUsers] = useState<{ username: string; role: 'admin' | 'staff'; createdAt?: string }[]>([]);
    const [userLoadError, setUserLoadError] = useState<string | null>(null);
    const [createError, setCreateError] = useState<string | null>(null);
    const [editUser, setEditUser] = useState<{ original: string; username: string; password: string; role: 'admin' | 'staff' } | null>(null);
    const [appToast, setAppToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [lastActivity, setLastActivity] = useState(Date.now());

    const handleLogin = (username: string, roleIn: 'admin' | 'staff') => {
        setIsAuthenticated(true);
        setUsername(username);
        setRole(roleIn);
        setLastActivity(Date.now());
    };

    const handleLogout = () => {
        logout();
        setIsAuthenticated(false);
        setUsername(null);
        setRole(null);
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

    // On mount try to restore existing session
    useEffect(() => {
        (async () => {
            const sess = await getSession();
            if (sess) {
                setIsAuthenticated(true);
                setUsername(sess.username);
                setRole(sess.role);
            }
        })();
    }, []);

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

    useEffect(() => {
        if (!appToast) return;
        const t = setTimeout(() => setAppToast(null), 4000);
        return () => clearTimeout(t);
    }, [appToast]);

    return (
        <BrowserRouter>
            <div className="header">
                <div className="locale-toggle">
                    <button onClick={toggleLocale}>
                        {locale === 'en' ? 'PT' : 'EN'}
                    </button>
                </div>
                {isAuthenticated && (
                    <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{username}</span>
                        {role === 'admin' && (
                            <button onClick={async () => { 
                                setShowAccountMgmt(true); 
                                setCreateError(null); 
                                try { const data = await listUsers(); setUsers(data); setUserLoadError(null);} catch(e:any){ setUserLoadError(e.message);} 
                            }}>Account Management</button>
                        )}
                        <button onClick={handleLogout}>Logout</button>
                    </div>
                )}
            </div>
            {showAccountMgmt && role === 'admin' && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
                    <div style={{ background:'#fff', padding:20, borderRadius:4, minWidth:320 }}>
                        <h3>Account Management</h3>
                        <div style={{ display:'flex', flexDirection:'column', gap:16, maxHeight:'70vh', overflowY:'auto' }}>
                            <section style={{ border:'1px solid #ddd', padding:10, borderRadius:4 }}>
                                <h4 style={{ marginTop:0 }}>Create User</h4>
                                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                    <input placeholder='Username' value={newUser.username} onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))} />
                                    <input placeholder='Password' type='password' value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} />
                                    <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value as 'admin' | 'staff' }))}>
                                        <option value='staff'>Staff</option>
                                        <option value='admin'>Admin</option>
                                    </select>
                                    {createError && <div style={{ color:'red' }}>{createError}</div>}
                                    <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                                        <button onClick={() => { setShowAccountMgmt(false); }}>Close</button>
                                        <button onClick={async () => { 
                                            setCreateError(null); 
                                            if (!newUser.username || !newUser.password) { setCreateError('Username and password required'); return; }
                                            try { 
                                                await createUser(newUser.username, newUser.password, newUser.role); 
                                                setAppToast({ message: 'User created', type: 'success' });
                                                setNewUser({ username:'', password:'', role:'staff' });
                                                // Refresh list
                                                const data = await listUsers(); setUsers(data);
                                                setShowAccountMgmt(false); // close after success
                                            } catch(e:any){ 
                                                setAppToast({ message: e.message || 'Failed creating user', type: 'error' }); 
                                            }
                                        }}>Create</button>
                                    </div>
                                </div>
                            </section>
                            <section style={{ border:'1px solid #ddd', padding:10, borderRadius:4 }}>
                                <h4 style={{ marginTop:0 }}>Existing Users</h4>
                                {userLoadError && <div style={{ color:'red' }}>{userLoadError}</div>}
                                <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:4 }}>
                                    {users.map(u => (
                                        <li key={u.username} style={{ border:'1px solid #ccc', padding:6, borderRadius:4, cursor:'pointer' }}
                                            onClick={() => setEditUser({ original: u.username, username: u.username, password: '', role: u.role })}>
                                            <strong>{u.username}</strong> <span style={{ opacity:0.7 }}>({u.role})</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        </div>
                        {editUser && (
                            <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100 }}>
                                <div style={{ background:'#fff', padding:20, borderRadius:4, minWidth:300 }}>
                                    <h4>Edit User</h4>
                                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                        <input placeholder='Username' value={editUser.username} onChange={e => setEditUser(prev => prev && ({ ...prev, username: e.target.value }))} />
                                        <input placeholder='New Password (leave blank to keep)' type='password' value={editUser.password} onChange={e => setEditUser(prev => prev && ({ ...prev, password: e.target.value }))} />
                                        <select value={editUser.role} onChange={e => setEditUser(prev => prev && ({ ...prev, role: e.target.value as 'admin' | 'staff' }))}>
                                            <option value='staff'>Staff</option>
                                            <option value='admin'>Admin</option>
                                        </select>
                                        <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
                                            <button onClick={() => setEditUser(null)}>Cancel</button>
                                            <button onClick={async () => { 
                                                if (!editUser) return; 
                                                try { 
                                                    await updateUser(editUser.original, { 
                                                        newUsername: editUser.username !== editUser.original ? editUser.username : undefined,
                                                        password: editUser.password || undefined,
                                                        role: editUser.role
                                                    });
                                                    setAppToast({ message: 'User updated', type: 'success' });
                                                    const data = await listUsers(); setUsers(data);
                                                    setEditUser(null);
                                                } catch(e:any){ setAppToast({ message: e.message || 'Update failed', type:'error' }); }
                                            }}>Save</button>
                                            <button style={{ background:'#b30000', color:'#fff' }} onClick={() => { 
                                                if (editUser.original === username) { setAppToast({ message: 'Cannot delete your own account', type: 'error' }); return; }
                                                if (confirm(`Delete user ${editUser.original}? This cannot be undone.`)) {
                                                    deleteUser(editUser.original).then(async () => {
                                                        setAppToast({ message: 'User deleted', type: 'success' });
                                                        const data = await listUsers(); setUsers(data);
                                                        setEditUser(null);
                                                    }).catch(e => setAppToast({ message: e.message || 'Delete failed', type:'error' }));
                                                }
                                            }}>Delete</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {appToast && (
                <div style={{ position:'fixed', bottom:20, right:20, background: appToast.type==='success' ? '#2e7d32' : '#c62828', color:'#fff', padding:'10px 14px', borderRadius:4, boxShadow:'0 2px 6px rgba(0,0,0,0.3)', zIndex: 20001 }} onAnimationEnd={() => {}}>
                    <span>{appToast.message}</span>
                    <button style={{ marginLeft:12, background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', cursor:'pointer' }} onClick={() => setAppToast(null)}>×</button>
                </div>
            )}
            <React.Suspense fallback={<div>Loading…</div>}>
            <Routes>
                <Route 
                    path="/" 
                    element={
                        isAuthenticated ? 
                        <Navigate to="/calendar" replace /> : 
                        <Login onLogin={(username, role) => handleLogin(username, role)} locale={locale} />
                    } 
                />
                <Route 
                    path="/calendar" 
                    element={
                        isAuthenticated ? 
                        <Calendar locale={locale} username={username} role={role} /> : 
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
                        <ReservationDetail locale={locale} username={username} role={role} /> :
                        <Navigate to="/" replace />
                    }
                />
            </Routes>
            </React.Suspense>
        </BrowserRouter>
    );
};

export default App;