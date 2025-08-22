import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Calendar.css';
import enTranslations from '../locales/en.json';
import ptTranslations from '../locales/pt.json';
import { fetchReservations, updateReservationStatus, fetchReservationHistory, updateReservationNotes, deleteReservation, updateReservation, type ReservationListItem, type ReservationHistoryEvent } from '../services/reservations';
import * as XLSX from 'xlsx';
import Toast from './Toast';

interface Translations {
    calendar: string;
    prevMonth: string;
    nextMonth: string;
    reservationDay: string;
    notes: string;
    newReservation: string;
    close: string;
    activeReservations: string;
    inactiveReservations: string;
    // add other translation keys here
}

interface CalendarProps {
    locale: 'en' | 'pt';
    username?: string | null;
    role?: 'admin' | 'staff' | null;
}

const Calendar: React.FC<CalendarProps> = ({ locale, username, role }) => {
    const [currentDate, setCurrentDate] = useState(() => {
        try {
            const stored = sessionStorage.getItem('calendarCurrentMonth');
            if (stored) {
                const d = new Date(stored);
                if (!isNaN(d.getTime())) return d;
            }
        } catch {}
        return new Date();
    });
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [reservations, setReservations] = useState<ReservationListItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedReservations, setSelectedReservations] = useState<ReservationListItem[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<string>('room 1');
    const roomOptions = ['room 1', 'room 2', 'room 3'];
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyEvents, setHistoryEvents] = useState<ReservationHistoryEvent[] | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    // Per-reservation notes state
    const [notesState, setNotesState] = useState<Record<string, { open: boolean; draft: string; baseline: string; saving: boolean }>>({});
    const [deleteChoiceFor, setDeleteChoiceFor] = useState<string | null>(null); // reservation id awaiting delete scope choice
    const navigate = useNavigate();

    // Notes editor helpers
    const toggleNotes = (res: ReservationListItem) => {
        if (!res._id) return;
        setNotesState(prev => {
            const existing = prev[res._id!];
            if (existing && existing.open) {
                // close
                return { ...prev, [res._id!]: { ...existing, open: false } };
            }
            // (Re)open with current server value as baseline/draft
            const current = (res as any).notes || '';
            return {
                ...prev,
                [res._id!]: {
                    open: true,
                    draft: current,
                    baseline: current,
                    saving: false
                }
            };
        });
    };
    const updateDraft = (id: string, val: string) => setNotesState(prev => prev[id] ? ({ ...prev, [id]: { ...prev[id], draft: val } }) : prev);
    const resetDraft = (id: string) => setNotesState(prev => prev[id] ? ({ ...prev, [id]: { ...prev[id], draft: prev[id].baseline } }) : prev);
    const saveNotes = async (res: ReservationListItem) => {
        if (!res._id) return;
        const canEdit = role === 'admin' || (role === 'staff' && username && res.author && username.toLowerCase() === res.author.toLowerCase());
        if (!canEdit) return;
        const st = notesState[res._id];
        if (!st || st.saving || st.draft === st.baseline) return;
        setNotesState(prev => ({ ...prev, [res._id!]: { ...prev[res._id!], saving: true } }));
        try {
            await updateReservationNotes(res._id, { notes: st.draft });
            setNotesState(prev => ({ ...prev, [res._id!]: { ...prev[res._id!], baseline: st.draft, saving: false } }));
            setToast({ message: (translations as any).notesUpdated || 'Notes updated', type: 'success' });
            await refreshMonthReservations();
        } catch {
            setNotesState(prev => ({ ...prev, [res._id!]: { ...prev[res._id!], saving: false } }));
            setToast({ message: (translations as any).notesUpdateFailed || 'Failed updating notes', type: 'error' });
        }
    };

    // UncontrolledNotes component removed (replaced by inline per-reservation editors)

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    useEffect(() => {
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString();

        const loadReservations = async () => {
            try {
                const fetchedReservations = await fetchReservations(startOfMonth, endOfMonth);
                if (process.env.NODE_ENV !== 'production') {
                    console.log('[Calendar] Fetched reservations', fetchedReservations.map(r => ({ id: r._id, dates: (r as any).dates, room: r.room, status: r.reservationStatus })));
                }
                setReservations(fetchedReservations);
            } catch (error) {
                console.error('Error fetching reservations:', error);
                setError('Failed to fetch reservations');
            } finally {
                setLoading(false);
            }
        };

        loadReservations();
    }, [currentDate]);

    // Persist current month selection across navigation within the session
    useEffect(() => {
        try {
            // Store first day of month to avoid DST edge issues
            const monthAnchor = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
            sessionStorage.setItem('calendarCurrentMonth', monthAnchor);
        } catch {}
    }, [currentDate]);

    // Helper to refresh reservations for the current month
    const refreshMonthReservations = async () => {
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString();
        try {
            const fetchedReservations = await fetchReservations(startOfMonth, endOfMonth);
            if (process.env.NODE_ENV !== 'production') {
                console.log('[Calendar] Refreshed reservations', fetchedReservations.map(r => ({ id: r._id, dates: (r as any).dates, room: r.room, status: r.reservationStatus })));
            }
            setReservations(fetchedReservations);
            if (selectedDay !== null) {
                const targetKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`;
                const dayReservations = fetchedReservations.filter(res => {
                    const datesArr: string[] = Array.isArray((res as any).dates) ? (res as any).dates : [];
                    const match = datesArr.some(d => d.slice(0,10) === targetKey);
                    return match && res.room === selectedRoom;
                });
                setSelectedReservations(dayReservations);
            }
        } catch (e) {
            console.error('Error refreshing reservations:', e);
        }
    };

    const handleExportMonth = () => {
        // Build month range and filter reservations currently loaded
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0);
        const inMonth = reservations.filter(r => {
            const datesArr: string[] = Array.isArray((r as any).dates) ? (r as any).dates : [];
            return datesArr.some(dStr => {
                const d = new Date(dStr);
                return d >= start && d <= end;
            });
        });

        // Shape rows for XLS
        const rows = inMonth
            .flatMap(r => {
                const datesArr: string[] = Array.isArray((r as any).dates) ? (r as any).dates : [];
                return datesArr.map(dStr => {
                    const dateObj = new Date(dStr);
                    return {
                        Date: dateObj.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }),
                        ISODate: dateObj.toISOString(),
                        Room: r.room,
                        Event: r.event,
                        EventClassification: (r as any).eventClassification || '',
                        Type: r.type,
                        ReservationStatus: r.reservationStatus || 'pre',
                        Flagged: r.reservationStatus === 'flagged' ? 'yes' : '',
                        Author: r.author || '',
                        NIF: (r as any).nif || '',
                        ProducerName: (r as any).producerName || '',
                        Email: (r as any).email || '',
                        Contact: (r as any).contact || '',
                        Responsible: (r as any).responsablePerson || '',
                        Notes: (r as any).notes || '',
                        AdminNotes: (r as any).adminNotes || '',
                        CreatedAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
                        UpdatedAt: (r as any).updatedAt ? new Date((r as any).updatedAt).toISOString() : ''
                    };
                });
            })
            .sort((a, b) => new Date(a.ISODate).getTime() - new Date(b.ISODate).getTime());

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Reservations');

        const monthName = new Date(2000, month, 1).toLocaleString(locale, { month: 'long' });
        const fileName = `reservations_${monthName}_${year}.xls`;
        XLSX.writeFile(wb, fileName, { bookType: 'xls' });
    setToast({ message: (translations as any).exportMonthSuccess || 'Exported month to XLS', type: 'success' });
    };

    const handleMonthChange = (m: number) => {
        setCurrentDate(new Date(currentDate.getFullYear(), m, 1));
    };

    const handleYearChange = (y: number) => {
        setCurrentDate(new Date(y, currentDate.getMonth(), 1));
    };

    const handleDayClick = (day: number) => {
        setError(null);
        setSelectedDay(day);
    // Ensure any prior delete-choice UI is reset when opening a (new) day popup
    setDeleteChoiceFor(null);
        const targetKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dayReservations = reservations.filter(res => {
            const datesArr: string[] = Array.isArray((res as any).dates) ? (res as any).dates : [];
            return datesArr.some(d => d.slice(0,10) === targetKey) && res.room === selectedRoom;
        });
        setSelectedReservations(dayReservations);
    setHistoryOpen(false);
    setHistoryEvents(null);
    setHistoryError(null);
    // notesTargetId reset removed
    };

    const closePopup = () => {
        setSelectedDay(null);
        setSelectedReservations([]);
        setError(null);
    setHistoryOpen(false);
    setHistoryEvents(null);
    setHistoryError(null);
    // Reset delete-choice state when popup closes so buttons return to normal next open
    setDeleteChoiceFor(null);
    // notesTargetId reset removed
    };

    const translations: Translations = locale === 'en' ? enTranslations : ptTranslations;

    const isPastDate = (day: number) => {
        const selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return selectedDate < today;
    };

    const renderCalendarDays = () => {
        const days = [];
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

        // Fill in the blanks for the days before the first day of the month
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<div key={`blank-${i}`} className="calendar-day blank"></div>);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const cellKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
            const dayReservations = reservations.filter(res => {
                const datesArr: string[] = Array.isArray((res as any).dates) ? (res as any).dates : [];
                return datesArr.some(d => d.slice(0,10) === cellKey);
            });
            const reservation = dayReservations.find(res => res.room === selectedRoom);
            const isToday = (new Date().toDateString() === date.toDateString());

            const hasR1 = dayReservations.some(res => res.room === 'room 1');
            const hasR2 = dayReservations.some(res => res.room === 'room 2');
            const hasR3 = dayReservations.some(res => res.room === 'room 3');
            const showR1 = hasR1 && selectedRoom !== 'room 1';
            const showR2 = hasR2 && selectedRoom !== 'room 2';
            const showR3 = hasR3 && selectedRoom !== 'room 3';

            const roomClass = reservation
                ? (selectedRoom === 'room 1' ? 'r1' : selectedRoom === 'room 2' ? 'r2' : 'r3')
                : '';
            const statusClass = reservation ? (reservation.reservationStatus ?? 'pre') : '';

            days.push(
                <div
                    key={i}
                    className={`calendar-day ${isPastDate(i) ? 'past-date' : ''} ${isToday ? 'today' : ''} ${reservation ? 'reservation' : ''} ${roomClass} ${statusClass}`}
                    onClick={() => handleDayClick(i)}
                >
                    <span className="day-number">{i}</span>
                    {reservation?.reservationStatus === 'flagged' && <span className="flag-corner" aria-hidden></span>}
                    {reservation && <div className="reservation-name">{reservation.event}</div>}
                    <div className="room-indicators">
                        {showR1 && <span className="room-dot r1" title="Room 1"></span>}
                        {showR2 && <span className="room-dot r2" title="Room 2"></span>}
                        {showR3 && <span className="room-dot r3" title="Room 3"></span>}
                    </div>
                </div>
            );
        }

        return days;
    };

    const loadHistory = async () => {
        if (selectedDay === null) return;
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const dayIso = new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay).toISOString();
            const events = await fetchReservationHistory(dayIso, selectedRoom);
            setHistoryEvents(events);
        } catch (e) {
            setHistoryError('Failed to load history');
        } finally {
            setHistoryLoading(false);
        }
    };

    const renderWeekDays = () => {
        const weekDays = [];
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const dayOfWeek = firstDayOfMonth.getDay();

        for (let i = 0; i < 7; i++) {
            const day = new Date(firstDayOfMonth);
            day.setDate(day.getDate() + i - dayOfWeek);
            let weekDayName = day.toLocaleDateString(locale, { weekday: 'short' });
            if (locale === 'pt') {
                weekDayName = weekDayName.replace('.', ''); // Remove the full stop in Portuguese
            }
            weekDays.push(
                <div key={i} className="calendar-weekday">
                    {weekDayName.charAt(0).toUpperCase() + weekDayName.slice(1)}
                </div>
            );
        }

        return weekDays;
    };

    const handleNewReservation = (selectedDay: Date | null = null, fromPopup: boolean = false) => {
        const date = selectedDay ? new Date(selectedDay) : null;
        navigate('/new-reservation', { 
            state: { 
                selectedDate: date ? date.toISOString() : null,
                room: selectedRoom,
                fromCalendarBox: fromPopup // Only true when called from popup
            } 
        });
    };

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>{error}</div>;
    }

    return (
        <div className="calendar-container">
            <div className="calendar-header">
                <div className="header-left">
                    {(() => {
                        const monthNames = Array.from({ length: 12 }, (_, i) => {
                            const name = new Date(2000, i, 1).toLocaleString(locale, { month: 'long' });
                            return name.charAt(0).toUpperCase() + name.slice(1);
                        });
                        const thisYear = new Date().getFullYear();
                        const years = Array.from({ length: 11 }, (_, i) => thisYear - 5 + i);
                        return (
                            <div className="month-year">
                                <select
                                    aria-label="Select month"
                                    value={currentDate.getMonth()}
                                    onChange={(e) => handleMonthChange(parseInt(e.target.value, 10))}
                                >
                                    {monthNames.map((label, idx) => (
                                        <option key={idx} value={idx}>{label}</option>
                                    ))}
                                </select>
                                <select
                                    aria-label="Select year"
                                    value={currentDate.getFullYear()}
                                    onChange={(e) => handleYearChange(parseInt(e.target.value, 10))}
                                >
                                    {years.map((y) => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                        );
                    })()}
                </div>
                <div className="header-center">
                    <select aria-label="Select room" value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
                        {roomOptions.map((r) => (
                            <option key={r} value={r}>{r.replace('room ', 'Room ')}</option>
                        ))}
                    </select>
                    <div className="room-legend" aria-hidden>
                        <div className="room-legend-item"><span className="room-dot r1"></span><span>Room 1</span></div>
                        <div className="room-legend-item"><span className="room-dot r2"></span><span>Room 2</span></div>
                        <div className="room-legend-item"><span className="room-dot r3"></span><span>Room 3</span></div>
                    </div>
                </div>
                <div className="header-right">
                    <button onClick={() => handleNewReservation(null, false)}>{translations.newReservation}</button>
                    <button
                        onClick={handleExportMonth}
                        style={{ marginLeft: 8 }}
                        aria-label="Download month XLS"
                        title="Download month XLS"
                    >
                        ⬇
                    </button>
                </div>
            </div>
            <div className="calendar-weekdays">
                {renderWeekDays()}
            </div>
            <div className="calendar-grid">
                {renderCalendarDays()}
            </div>
            {selectedDay !== null && (
                <div className="popup">
                    <div className="popup-content">
                        <h2>{translations.reservationDay} - {String(selectedDay).padStart(2,'0')}/{String(currentDate.getMonth()+1).padStart(2,'0')}/{currentDate.getFullYear()}</h2>
                        {error && <div className="error-message">{error}</div>}
                        <div className="popup-actions" style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                            {!isPastDate(selectedDay) && (
                                <button
                                    onClick={() => handleNewReservation(
                                        new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay),
                                        true
                                    )}
                                >
                                    {translations.newReservation}
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    if (!historyOpen) {
                                        loadHistory();
                                    }
                                    setHistoryOpen(o => !o);
                                }}
                            >
                                {historyOpen ? (translations as any).hideHistory || 'Hide History' : (translations as any).history || 'History'}
                            </button>
                            <button onClick={closePopup}>{translations.close}</button>
                        </div>
                        <hr />
                        {(() => {
                            const reservationLabel = (translations as any).reservationSingular || 'Reservation';
                            const preLabel = (translations as any).preReservations || 'Pre-Reservations';
                            const reservationEntry = selectedReservations.find(r => r.reservationStatus && r.reservationStatus !== 'pre');
                            const preEntries = selectedReservations.filter(r => !r.reservationStatus || r.reservationStatus === 'pre');
                            const renderReservationCard = (res: ReservationListItem) => {
                                const baseValue = (!res.reservationStatus || res.reservationStatus === 'pre') ? 'pre' : 'confirmed';
                                return (
                                    <div className="reservation" key={res._id}>
                                        <p>{res.event}</p>
                                        {res.author ? <p>{res.author}</p> : null}
                                        <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:8, marginTop:4 }}>
                                            <label style={{ marginRight: '6px' }}>{(translations as any).status || 'Status'}:</label>
                                            <select
                                                value={baseValue}
                                                onChange={async (e) => {
                                                    if (!res._id) return;
                                                    const base = e.target.value as 'pre' | 'confirmed';
                                                    const next = base === 'pre' ? 'pre' : (res.reservationStatus === 'flagged' ? 'flagged' : 'confirmed');
                                                    try {
                                                        await updateReservationStatus(res._id, next);
                                                        await refreshMonthReservations();
                                                        setToast({ message: (translations as any).statusUpdated || 'Status updated', type: 'success' });
                                                    } catch (err: any) {
                                                        if (err?.response?.status === 409) {
                                                            setToast({ message: (translations as any).statusConflict || 'Another confirmed/flagged reservation exists for this day & room', type: 'error' });
                                                        } else {
                                                            setToast({ message: (translations as any).statusUpdateFailed || 'Failed to update status', type: 'error' });
                                                        }
                                                    }
                                                }}
                                            >
                                                <option value="pre">Pre-reservation</option>
                                                <option value="confirmed">Reservation</option>
                                            </select>
                                            {res.reservationStatus && res.reservationStatus !== 'pre' && (
                                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={res.reservationStatus === 'flagged'}
                                                        onChange={async (e) => {
                                                            if (!res._id) return;
                                                            const next = e.target.checked ? 'flagged' as const : 'confirmed' as const;
                                                            try {
                                                                await updateReservationStatus(res._id, next);
                                                                await refreshMonthReservations();
                                                                setToast({ message: (translations as any).statusUpdated || 'Status updated', type: 'success' });
                                                            } catch {
                                                                setToast({ message: (translations as any).statusUpdateFailed || 'Failed to update status', type: 'error' });
                                                            }
                                                        }}
                                                    />
                                                    <span>{(translations as any).flaggedPaid || 'Flagged (paid)'}</span>
                                                </label>
                                            )}
                                        </div>
                                        <div style={{ marginTop:8, display:'flex', flexDirection:'row', gap:6, flexWrap:'wrap' }}>
                                            {(() => {
                                                const canEdit = role === 'admin' || (role === 'staff' && username && res.author && username.toLowerCase() === res.author.toLowerCase());
                                                return (
                                                    <button
                                                        style={{ padding:'4px 8px', fontSize:'0.7rem', opacity: canEdit ? 1 : 0.6 }}
                                                        disabled={!canEdit}
                                                        onClick={() => canEdit && toggleNotes(res)}
                                                        title={notesState[res._id || '']?.open ? ((translations as any).closeNotesEditor || 'Close Notes') : ((translations as any).editNotes || 'Edit Notes')}
                                                    >
                                                        {notesState[res._id || '']?.open ? ((translations as any).closeNotesEditor || 'Close Notes') : ((translations as any).editNotes || 'Edit Notes')}
                                                    </button>
                                                );
                                            })()}
                                            <button style={{ padding:'4px 8px', fontSize:'0.75rem' }} onClick={() => navigate(`/reservation/${res._id}`)}>{(translations as any).view || 'View'}</button>
                                        </div>
                                        {!notesState[res._id || '']?.open && (res as any).notes && (
                                            <div style={{ marginTop:4, fontSize:'0.65rem', whiteSpace:'pre-wrap', background:'#f9f9f9', border:'1px solid #eee', padding:4, borderRadius:4 }}>
                                                {(res as any).notes}
                                            </div>
                                        )}
                                        {notesState[res._id || '']?.open && (() => {
                                            const canEdit = role === 'admin' || (role === 'staff' && username && res.author && username.toLowerCase() === res.author.toLowerCase());
                                            const state = notesState[res._id || ''];
                                            return (
                                                <div style={{ marginTop:8 }}>
                                                    {canEdit ? (
                                                        <>
                                                            <textarea
                                                                style={{ width:'100%', minHeight:60, padding:6, border:'1px solid #bbb', borderRadius:4, resize:'vertical' }}
                                                                value={state.draft}
                                                                onChange={e => updateDraft(res._id!, e.target.value)}
                                                            />
                                                            <div style={{ display:'flex', gap:6, marginTop:4 }}>
                                                                <button
                                                                    style={{ padding:'4px 10px', fontSize:'0.7rem' }}
                                                                    disabled={state.saving || state.draft === state.baseline}
                                                                    onClick={() => saveNotes(res)}
                                                                >{state.saving ? ((translations as any).saving || 'Saving...') : ((translations as any).save || 'Save')}</button>
                                                                <button
                                                                    style={{ padding:'4px 10px', fontSize:'0.7rem' }}
                                                                    disabled={state.saving || state.draft === state.baseline}
                                                                    onClick={() => resetDraft(res._id!)}
                                                                >{(translations as any).reset || 'Reset'}</button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div style={{ fontSize:'0.65rem', whiteSpace:'pre-wrap', background:'#f9f9f9', border:'1px solid #eee', padding:6, borderRadius:4 }}>
                                                            {(res as any).notes || ''}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                );
                            };
                const renderPreCard = (res: ReservationListItem, anyConfirmed: boolean) => {
                                const baseValue = (!res.reservationStatus || res.reservationStatus === 'pre') ? 'pre' : 'confirmed';
                                return (
                                    <div className="reservation pre-reservation" key={res._id} style={{ borderBottom: '1px solid #ddd', paddingBottom: 8, marginBottom: 8 }}>
                                        <p>{res.event}</p>
                                        {res.author ? <p>{res.author}</p> : null}
                                        <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:8, marginTop:4 }}>
                                            <label style={{ marginRight: '6px' }}>{(translations as any).status || 'Status'}:</label>
                                            <select
                                                value={baseValue}
                                                disabled={baseValue === 'pre' && anyConfirmed}
                                                onChange={async (e) => {
                                                    if (!res._id) return;
                                                    const base = e.target.value as 'pre' | 'confirmed';
                                                    const next = base === 'pre' ? 'pre' : 'confirmed';
                                                    try {
                                                        await updateReservationStatus(res._id, next);
                                                        await refreshMonthReservations();
                                                        setToast({ message: (translations as any).statusUpdated || 'Status updated', type: 'success' });
                                                    } catch (err: any) {
                                                        if (err?.response?.status === 409) {
                                                            setToast({ message: (translations as any).statusConflict || 'Another confirmed/flagged reservation exists for this day & room', type: 'error' });
                                                        } else {
                                                            setToast({ message: (translations as any).statusUpdateFailed || 'Failed to update status', type: 'error' });
                                                        }
                                                    }
                                                }}
                                            >
                                                <option value="pre">Pre-reservation</option>
                                                <option value="confirmed" disabled={anyConfirmed}>Reservation</option>
                                            </select>
                                        </div>
                                        <div style={{ marginTop:8, display:'flex', flexDirection:'row', gap:6, flexWrap:'wrap' }}>
                                            {(() => {
                                                const canEdit = role === 'admin' || (role === 'staff' && username && res.author && username.toLowerCase() === res.author.toLowerCase());
                                                return (
                                                    <button
                                                        style={{ padding:'4px 8px', fontSize:'0.7rem', opacity: canEdit ? 1 : 0.6 }}
                                                        disabled={!canEdit}
                                                        onClick={() => canEdit && toggleNotes(res)}
                                                        title={notesState[res._id || '']?.open ? ((translations as any).closeNotesEditor || 'Close Notes') : ((translations as any).editNotes || 'Edit Notes')}
                                                    >
                                                        {notesState[res._id || '']?.open ? ((translations as any).closeNotesEditor || 'Close Notes') : ((translations as any).editNotes || 'Edit Notes')}
                                                    </button>
                                                );
                                            })()}
                                            <button style={{ padding:'4px 8px', fontSize:'0.75rem' }} onClick={() => navigate(`/reservation/${res._id}`)}>{(translations as any).view || 'View'}</button>
                                            {(() => {
                                                const canDelete = (role === 'admin') || (role === 'staff' && username && res.author && username.toLowerCase() === res.author.toLowerCase());
                                                if (!canDelete) return null;
                                                const multiDay = Array.isArray((res as any).dates) && (res as any).dates.length > 1;
                                                const targetDayKey = selectedDay !== null ? `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}` : null;
                                                const thisDayIncluded = multiDay && targetDayKey ? (res as any).dates.some((d:string)=> d.slice(0,10) === targetDayKey) : false;
                                                if (deleteChoiceFor === res._id) {
                                                    // Choice UI
                                                    return (
                                                        <span style={{ display:'inline-flex', gap:4, flexWrap:'wrap' }}>
                                                            {multiDay && thisDayIncluded && (
                                                                <button
                                                                    style={{ padding:'4px 8px', fontSize:'0.65rem', background:'#b36b00', color:'#fff' }}
                                                                    onClick={async () => {
                                                                        if (!res._id || !targetDayKey) return;
                                                                        try {
                                                                            const remaining = (res as any).dates.filter((d:string)=> d.slice(0,10) !== targetDayKey);
                                                                            await updateReservation(res._id, { dates: remaining });
                                                                            setDeleteChoiceFor(null);
                                                                            await refreshMonthReservations();
                                                                            setToast({ message: (translations as any).dayRemoved || 'Day removed', type: 'success' });
                                                                        } catch {
                                                                            setToast({ message: (translations as any).dayRemoveFailed || 'Failed removing day', type: 'error' });
                                                                        }
                                                                    }}
                                                                >{(translations as any).removeThisDay || 'Remove this day'}</button>
                                                            )}
                                                            <button
                                                                style={{ padding:'4px 8px', fontSize:'0.65rem', background:'#c62828', color:'#fff' }}
                                                                onClick={async () => {
                                                                    if (!res._id) return;
                                                                    if (!window.confirm((translations as any).confirmDeletePreAll || 'Delete all days for this pre-reservation?')) return;
                                                                    try {
                                                                        await deleteReservation(res._id);
                                                                        setNotesState(prev => { const copy = { ...prev }; delete copy[res._id!]; return copy; });
                                                                        setDeleteChoiceFor(null);
                                                                        await refreshMonthReservations();
                                                                        setToast({ message: (translations as any).reservationDeleted || 'Reservation deleted', type: 'success' });
                                                                    } catch {
                                                                        setToast({ message: (translations as any).reservationDeleteFailed || 'Failed to delete reservation', type: 'error' });
                                                                    }
                                                                }}
                                                            >{(translations as any).removeAllDays || 'Remove all days'}</button>
                                                            <button
                                                                style={{ padding:'4px 8px', fontSize:'0.65rem' }}
                                                                onClick={() => setDeleteChoiceFor(null)}
                                                            >{(translations as any).cancel || 'Cancel'}</button>
                                                        </span>
                                                    );
                                                }
                                                return (
                                                    <button
                                                        style={{ padding:'4px 8px', fontSize:'0.7rem', background:'#c62828', color:'#fff' }}
                                                        onClick={() => {
                                                            if (multiDay) {
                                                                setDeleteChoiceFor(res._id || null);
                                                            } else {
                                                                if (!res._id) return;
                                                                if (!window.confirm((translations as any).confirmDeletePre || 'Delete this pre-reservation?')) return;
                                                                (async () => {
                                                                    try {
                                                                        await deleteReservation(res._id!);
                                                                        setNotesState(prev => { const copy = { ...prev }; delete copy[res._id!]; return copy; });
                                                                        await refreshMonthReservations();
                                                                        setToast({ message: (translations as any).reservationDeleted || 'Reservation deleted', type: 'success' });
                                                                    } catch {
                                                                        setToast({ message: (translations as any).reservationDeleteFailed || 'Failed to delete reservation', type: 'error' });
                                                                    }
                                                                })();
                                                            }
                                                        }}
                                                    >{(translations as any).remove || 'Remove'}</button>
                                                );
                                            })()}
                                        </div>
                                        {!notesState[res._id || '']?.open && (res as any).notes && (
                                            <div style={{ marginTop:4, fontSize:'0.65rem', whiteSpace:'pre-wrap', background:'#f9f9f9', border:'1px solid #eee', padding:4, borderRadius:4 }}>
                                                {(res as any).notes}
                                            </div>
                                        )}
                                        {notesState[res._id || '']?.open && (() => {
                                            const canEdit = role === 'admin' || (role === 'staff' && username && res.author && username.toLowerCase() === res.author.toLowerCase());
                                            const state = notesState[res._id || ''];
                                            return (
                                                <div style={{ marginTop:8 }}>
                                                    {canEdit ? (
                                                        <>
                                                            <textarea
                                                                style={{ width:'100%', minHeight:60, padding:6, border:'1px solid #bbb', borderRadius:4, resize:'vertical' }}
                                                                value={state.draft}
                                                                onChange={e => updateDraft(res._id!, e.target.value)}
                                                            />
                                                            <div style={{ display:'flex', gap:6, marginTop:4 }}>
                                                                <button
                                                                    style={{ padding:'4px 10px', fontSize:'0.7rem' }}
                                                                    disabled={state.saving || state.draft === state.baseline}
                                                                    onClick={() => saveNotes(res)}
                                                                >{state.saving ? ((translations as any).saving || 'Saving...') : ((translations as any).save || 'Save')}</button>
                                                                <button
                                                                    style={{ padding:'4px 10px', fontSize:'0.7rem' }}
                                                                    disabled={state.saving || state.draft === state.baseline}
                                                                    onClick={() => resetDraft(res._id!)}
                                                                >{(translations as any).reset || 'Reset'}</button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div style={{ fontSize:'0.65rem', whiteSpace:'pre-wrap', background:'#f9f9f9', border:'1px solid #eee', padding:6, borderRadius:4 }}>
                                                            {(res as any).notes || ''}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                );
                            };
                            return (
                                <>
                                    <section>
                                        <h3>{reservationLabel}</h3>
                                        {reservationEntry ? renderReservationCard(reservationEntry) : <p>{(translations as any).noReservation || (locale === 'pt' ? 'Nenhuma reserva' : 'No reservation')}</p>}
                                    </section>
                                    <hr />
                                    <section>
                                        <h3>{preLabel}</h3>
                                        {preEntries.length > 0 ? preEntries.map(r => renderPreCard(r, !!reservationEntry)) : <p>{(translations as any).noPreReservations || (locale === 'pt' ? 'Sem pré-reservas' : 'No pre-reservations')}</p>}
                                    </section>
                                </>
                            );
                        })()}
                        {historyOpen && (
                            <>
                                <hr />
                                <div className="history-panel" style={{ maxHeight: 180, overflowY: 'auto', marginTop: 16 }}>
                                    {historyLoading && <div>{(translations as any).loadingHistory || 'Loading history...'}</div>}
                                    {historyError && <div className="error-message">{historyError}</div>}
                                    {!historyLoading && !historyError && historyEvents && historyEvents.length === 0 && (
                                        <div>{(translations as any).noHistoryDay || 'No history for this day'}</div>
                                    )}
                                    {!historyLoading && !historyError && historyEvents && historyEvents.length > 0 && (
                                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ textAlign: 'left' }}>{(translations as any).time || 'Time'}</th>
                                                    <th style={{ textAlign: 'left' }}>{(translations as any).user || 'User'}</th>
                                                    <th style={{ textAlign: 'left' }}>{(translations as any).event || 'Event'}</th>
                                                    <th style={{ textAlign: 'left' }}>{(translations as any).action || 'Action'}</th>
                                                    <th style={{ textAlign: 'left' }}>{(translations as any).from || 'From'}</th>
                                                    <th style={{ textAlign: 'left' }}>{(translations as any).to || 'To'}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {historyEvents.map((ev, idx) => (
                                                    <tr key={idx} style={ idx < historyEvents.length - 1 ? { borderBottom: '1px solid #eee' } : undefined }>
                                                        <td>{new Date(ev.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                                                        <td>{ev.user || ''}</td>
                                                        <td>{ev.event || ''}</td>
                                                        <td>{ev.action}</td>
                                                        <td>{ev.fromStatus || ''}</td>
                                                        <td>{ev.toStatus || ''}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </>
                        )}
                        {/* per-reservation notes editors inline above */}
                    </div>
                </div>
            )}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    );
};

export default Calendar;