import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
const Calendar = React.lazy(() => import('./components/Calendar'));
const NewReservation = React.lazy(() => import('./components/NewReservation'));
const ReservationDetail = React.lazy(() => import('./components/ReservationDetail') as Promise<{ default: React.ComponentType<{ locale: 'en' | 'pt'; username?: string | null; role?: 'admin' | 'staff' | null }> }>);
import { logout, getSession, createUser, listUsers, updateUser, deleteUser } from './services/auth';
import { clearReservationCache, fetchDayClearEvents, consumeDayClearEvent, consumeDayClearEvents } from './services/reservations';
import enTranslations from './locales/en.json';
import ptTranslations from './locales/pt.json';

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
    const [dayClearNotifs, setDayClearNotifs] = useState<{ id: string; room: string; dateISO: string; dayKey: string; message: string; createdAt: number }[]>([]);
    const [openDayRequest, setOpenDayRequest] = useState<{ room: string; dateISO: string; nonce: number } | null>(null);
    const [notifOpen, setNotifOpen] = useState(false);
    const translations: any = locale === 'en' ? enTranslations : ptTranslations;
    // Track per-user seen day-clear notifications (room|dayKey) persisted across sessions
    // Server-driven day-clear events state (unconsumed)
    const lastEventsFetchRef = React.useRef<string | null>(null);

    const handleLogin = (username: string, roleIn: 'admin' | 'staff') => {
        setIsAuthenticated(true);
        setUsername(username);
        setRole(roleIn);
        setLastActivity(Date.now());
        clearReservationCache(); // ensure fresh data for this user
        // Load previously seen notifications for this user
    setDayClearNotifs([]); // reset notifications; will repopulate from server polling
    lastEventsFetchRef.current = null;
    };

    const handleLogout = () => {
        logout();
        setIsAuthenticated(false);
        clearReservationCache();
        setUsername(null);
        setRole(null);
    setDayClearNotifs([]);
    lastEventsFetchRef.current = null;
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
                setUsername(prev => {
                    if (prev && prev !== sess.username) {
                        // user changed silently (e.g., server-side), clear cache
                        clearReservationCache();
                    }
                    return sess.username;
                });
                setRole(sess.role);
                // Load seen notifications for restored session user
                lastEventsFetchRef.current = null;
            }
        })();
    }, []);

    // Inactivity/logout handling with broader activity signals (scroll, touch, keydown, etc.)
    useEffect(() => {
        if (!isAuthenticated) return;
        const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15m
        const checkInactivity = () => {
            if (Date.now() - lastActivity > INACTIVITY_LIMIT_MS) {
                handleLogout();
            }
        };
        const interval = setInterval(checkInactivity, 60 * 1000);
        const activityHandler = () => setLastActivity(Date.now());
        const events: (keyof WindowEventMap)[] = [
            'click','mousemove','mousedown','keydown','touchstart','scroll'
        ];
        events.forEach(ev => window.addEventListener(ev, activityHandler, { passive: true } as any));
        const visHandler = () => { if (document.visibilityState === 'visible') activityHandler(); };
        document.addEventListener('visibilitychange', visHandler);
        return () => {
            clearInterval(interval);
            events.forEach(ev => window.removeEventListener(ev, activityHandler));
            document.removeEventListener('visibilitychange', visHandler);
        };
    }, [isAuthenticated, lastActivity]);

    // Periodic session validation to restore username if still valid and prevent silent disappearance
    useEffect(() => {
        if (!isAuthenticated) return;
        let cancelled = false;
        const tick = async () => {
            try {
                const sess = await getSession();
                if (!sess) {
                    // Session actually gone -> logout (will clear username)
                    handleLogout();
                } else {
            setUsername(u => {
                        if (u && u !== sess.username) {
                            clearReservationCache();
                setDayClearNotifs([]);
                lastEventsFetchRef.current = null;
                        }
                        return u || sess.username;
                    });
                    setRole(r => r || sess.role);
                }
            } catch {}
            if (!cancelled) setTimeout(tick, 4 * 60 * 1000); // every 4 minutes
        };
        tick();
        return () => { cancelled = true; };
    }, [isAuthenticated]);

    useEffect(() => {
        if (!appToast) return;
        const t = setTimeout(() => setAppToast(null), 4000);
        return () => clearTimeout(t);
    }, [appToast]);

    // Poll server-side day clear events (lightweight) instead of client diff sweeps
    useEffect(() => {
        if (!isAuthenticated || !username) return;
        let stopped = false;
        let timer: any;
        const poll = async () => {
            if (stopped) return;
            try {
                const events = await fetchDayClearEvents(lastEventsFetchRef.current || undefined);
                if (events.length) {
                    lastEventsFetchRef.current = new Date().toISOString();
                    // Transform to notification shape used earlier
                    const notifs = events.map(e => ({
                        id: String(e.id),
                        room: e.room,
                        dateISO: e.dayKey + 'T00:00:00.000Z',
                        dayKey: e.dayKey,
                        message: (translations.notifDayClearSingle || 'Day {{DAY}}/{{MONTH}}/{{YEAR}} is now clear of reservations, click to see')
                            .replace('{{DAY}}', e.dayKey.slice(8,10))
                            .replace('{{MONTH}}', e.dayKey.slice(5,7))
                            .replace('{{YEAR}}', e.dayKey.slice(0,4)),
                        createdAt: new Date(e.createdAt).getTime()
                    }));
                    setDayClearNotifs(prev => {
                        const existingIds = new Set(prev.map(p => p.id));
                        const merged = [...prev];
                        notifs.forEach(n => { if (!existingIds.has(n.id)) merged.push(n); });
                        return merged;
                    });
                } else if (!lastEventsFetchRef.current) {
                    // Set a baseline to avoid refetching entire history repeatedly
                    lastEventsFetchRef.current = new Date().toISOString();
                }
            } catch (e) {
                // silent
            } finally {
                if (!stopped) {
                    const base = 75 * 1000; // 75s base
                    const jitter = Math.random() * 15 * 1000; // +0–15s
                    timer = setTimeout(poll, base + jitter);
                }
            }
        };
        // Initial slight delay to avoid login burst
        timer = setTimeout(poll, 5000);
        return () => { stopped = true; if (timer) clearTimeout(timer); };
    }, [isAuthenticated, username, translations]);

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
                        <span style={{ display:'inline-flex', alignItems:'center', gap:6, position:'relative' }}>
                            {username}
                            <button
                                aria-label={translations.notifBellTooltip || 'Reservation updates'}
                                style={{ background:'transparent', border:'none', cursor:'pointer', position:'relative', fontSize:'1rem' }}
                                onClick={() => setNotifOpen(o => !o)}
                                title={translations.notifBellTooltip || 'Reservation updates'}
                            >
                                🔔{dayClearNotifs.length > 0 && <span style={{ position:'absolute', top:-4, right:-6, background:'#d32f2f', color:'#fff', borderRadius:'50%', padding:'0 5px', fontSize:'0.55rem' }}>{dayClearNotifs.length}</span>}
                            </button>
                            {notifOpen && (
                                <div style={{ position:'absolute', top:24, right:0, background:'#fff', border:'1px solid #ccc', borderRadius:4, minWidth:260, zIndex:5000, boxShadow:'0 2px 8px rgba(0,0,0,0.2)', padding:8 }}>
                                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6, gap:8 }}>
                                        <strong style={{ fontSize:'0.8rem' }}>{translations.notifTitle || 'Notifications'}</strong>
                                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                            {dayClearNotifs.length > 0 && (
                                                <button
                                                    style={{ fontSize:'0.55rem', padding:'2px 6px', background:'#eee', border:'1px solid #ccc', cursor:'pointer' }}
                                                    onClick={async () => {
                                                        const ids = dayClearNotifs.map(n => n.id);
                                                        setDayClearNotifs([]); // optimistic clear
                                                        try { await consumeDayClearEvents(ids); } catch { /* revert on failure */ }
                                                    }}
                                                >{translations.notifMarkAllRead || 'Mark all read'}</button>
                                            )}
                                            <button style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:'0.8rem' }} onClick={() => setNotifOpen(false)}>×</button>
                                        </div>
                                    </div>
                                    {dayClearNotifs.length === 0 && (
                                        <div style={{ fontSize:'0.7rem', padding:4 }}>{translations.notifNone || 'No notifications'}</div>
                                    )}
                                    {dayClearNotifs.length > 0 && (
                                        <ul style={{ listStyle:'none', padding:0, margin:0, maxHeight:240, overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
                                            {dayClearNotifs.slice().sort((a,b)=>b.createdAt - a.createdAt).map(n => {
                                                const persistSeen = () => { /* server events consumed below */ };
                                                return (
                                                    <li key={n.id} style={{ border:'1px solid #e0e0e0', borderRadius:4, padding:6, background:'#fafafa', fontSize:'0.65rem', display:'flex', flexDirection:'column', gap:4 }}>
                                                        <div style={{ whiteSpace:'pre-wrap' }}>{n.message}</div>
                                                        <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                                                            <button style={{ fontSize:'0.6rem', padding:'2px 6px' }} onClick={() => {
                                                                // Open should NOT consume or remove the notification; user can still discard later.
                                                                persistSeen();
                                                                setOpenDayRequest({ room: n.room, dateISO: n.dateISO, nonce: Date.now() });
                                                                // Auto-collapse popover after opening to focus on calendar
                                                                setNotifOpen(false);
                                                            }}>{translations.notifOpen || 'Open'}</button>
                                                            <button style={{ fontSize:'0.6rem', padding:'2px 6px' }} onClick={() => {
                                                                persistSeen();
                                                                consumeDayClearEvent(n.id).catch(()=>{});
                                                                setDayClearNotifs(list => list.filter(x => x.id !== n.id));
                                                            }}>{translations.notifDismiss || 'Dismiss'}</button>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </span>
                        {role === 'admin' && (
                            <button onClick={async () => { 
                                setShowAccountMgmt(true); 
                                setCreateError(null); 
                                try { const data = await listUsers(); setUsers(data); setUserLoadError(null);} catch(e:any){ setUserLoadError(e.message);} 
                            }}>{translations.accountManagement || 'Account Management'}</button>
                        )}
                        <button onClick={handleLogout}>Logout</button>
                    </div>
                )}
            </div>
            {showAccountMgmt && role === 'admin' && (
                <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
                    <div style={{ background:'#fff', padding:20, borderRadius:4, minWidth:320 }}>
                        <h3>{translations.accountManagement || 'Account Management'}</h3>
                        <div style={{ display:'flex', flexDirection:'column', gap:16, maxHeight:'70vh', overflowY:'auto' }}>
                            <section style={{ border:'1px solid #ddd', padding:10, borderRadius:4 }}>
                                <h4 style={{ marginTop:0 }}>{translations.createUserHeading || 'Create User'}</h4>
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
                                            if (!newUser.username || !newUser.password) { setCreateError(translations.usernamePasswordRequired || 'Username and password required'); return; }
                                            try { 
                                                await createUser(newUser.username, newUser.password, newUser.role); 
                                                setAppToast({ message: translations.userCreated || 'User created', type: 'success' });
                                                setNewUser({ username:'', password:'', role:'staff' });
                                                // Refresh list
                                                const data = await listUsers(); setUsers(data);
                                                setShowAccountMgmt(false); // close after success
                                            } catch(e:any){ 
                                                setAppToast({ message: e.message || translations.failedCreatingUser || 'Failed creating user', type: 'error' }); 
                                            }
                                        }}>Create</button>
                                    </div>
                                </div>
                            </section>
                            <section style={{ border:'1px solid #ddd', padding:10, borderRadius:4 }}>
                                <h4 style={{ marginTop:0 }}>{translations.existingUsersHeading || 'Existing Users'}</h4>
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
                                                    setAppToast({ message: translations.userUpdated || 'User updated', type: 'success' });
                                                    const data = await listUsers(); setUsers(data);
                                                    setEditUser(null);
                                                } catch(e:any){ setAppToast({ message: e.message || translations.updateFailed || 'Update failed', type:'error' }); }
                                            }}>Save</button>
                                            <button style={{ background:'#b30000', color:'#fff' }} onClick={() => { 
                                                if (editUser.original === username) { setAppToast({ message: translations.cannotDeleteSelf || 'Cannot delete your own account', type: 'error' }); return; }
                                                if (confirm((translations.deleteUserConfirm || 'Delete user {{USERNAME}}? This cannot be undone.').replace('{{USERNAME}}', editUser.original))) {
                                                    deleteUser(editUser.original).then(async () => {
                                                        setAppToast({ message: translations.userDeleted || 'User deleted', type: 'success' });
                                                        const data = await listUsers(); setUsers(data);
                                                        setEditUser(null);
                                                    }).catch(e => setAppToast({ message: e.message || translations.deleteFailed || 'Delete failed', type:'error' }));
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
                        <Calendar
                            locale={locale}
                            username={username}
                            role={role}
                            onDayClear={(n) => setDayClearNotifs(prev => [...prev, ...n])}
                            openDayRequest={openDayRequest}
                            onConsumeOpenDayRequest={() => setOpenDayRequest(null)}
                        /> : 
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