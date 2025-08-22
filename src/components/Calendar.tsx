import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Calendar.css';
import enTranslations from '../locales/en.json';
import ptTranslations from '../locales/pt.json';
import { fetchReservations, updateReservationStatus, fetchReservationHistory, updateReservationNotes, deleteReservation, updateReservation, type ReservationListItem, type ReservationHistoryEvent } from '../services/reservations';
import * as XLSX from 'xlsx';
import Toast from './Toast';
import DayCell from './DayCell';
import DayPopup from './DayPopup';

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
        const cells: React.ReactNode[] = [];
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
        for (let i = 0; i < firstDayOfMonth; i++) {
            cells.push(<div key={`blank-${i}`} className="calendar-day blank" />);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            const cellKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
            const isToday = (new Date().toDateString() === date.toDateString());
            cells.push(
                <DayCell
                    key={i}
                    day={i}
                    date={date}
                    cellKey={cellKey}
                    reservations={reservations}
                    selectedRoom={selectedRoom}
                    isPast={isPastDate(i)}
                    isToday={isToday}
                    onClick={handleDayClick}
                />
            );
        }
        return cells;
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
            {selectedDay !== null && (() => {
                const reservationEntry = selectedReservations.find(r => r.reservationStatus && r.reservationStatus !== 'pre');
                const preEntries = selectedReservations.filter(r => !r.reservationStatus || r.reservationStatus === 'pre');
                const targetDayKey = selectedDay !== null ? `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}` : null;
                return (
                    <DayPopup
                        day={selectedDay}
                        currentDate={currentDate}
                        translations={translations}
                        reservations={selectedReservations}
                        reservationEntry={reservationEntry}
                        preEntries={preEntries}
                        anyConfirmed={!!reservationEntry}
                        notesState={notesState}
                        toggleNotes={toggleNotes}
                        updateDraft={updateDraft}
                        resetDraft={resetDraft}
                        saveNotes={saveNotes}
                        role={role}
                        username={username}
                        onNewReservation={() => handleNewReservation(new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay), true)}
                        onClose={closePopup}
                        onStatusChange={async (id, next) => {
                            try {
                                await updateReservationStatus(id, next);
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
                        onFlagToggle={async (id, checked) => {
                            try {
                                await updateReservationStatus(id, checked ? 'flagged' : 'confirmed');
                                await refreshMonthReservations();
                                setToast({ message: (translations as any).statusUpdated || 'Status updated', type: 'success' });
                            } catch {
                                setToast({ message: (translations as any).statusUpdateFailed || 'Failed to update status', type: 'error' });
                            }
                        }}
                        onDelete={async (id) => {
                            await deleteReservation(id);
                            setNotesState(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
                            setDeleteChoiceFor(null);
                            await refreshMonthReservations();
                            setToast({ message: (translations as any).reservationDeleted || 'Reservation deleted', type: 'success' });
                        }}
                        onDeleteDay={async (id) => {
                            if (!targetDayKey) return;
                            const res = selectedReservations.find(r => r._id === id);
                            if (!res) return;
                            const remaining = (res as any).dates.filter((d: string) => d.slice(0,10) !== targetDayKey);
                            await updateReservation(id, { dates: remaining });
                            setDeleteChoiceFor(null);
                            await refreshMonthReservations();
                            setToast({ message: (translations as any).dayRemoved || 'Day removed', type: 'success' });
                        }}
                        deleteChoiceFor={deleteChoiceFor}
                        setDeleteChoiceFor={setDeleteChoiceFor}
                        targetDayKey={targetDayKey}
                        historyOpen={historyOpen}
                        toggleHistory={() => setHistoryOpen(o => !o)}
                        historyLoading={historyLoading}
                        historyError={historyError}
                        historyEvents={historyEvents}
                        loadHistory={loadHistory}
                        navigateTo={(id) => navigate(`/reservation/${id}`)}
                    />
                );
            })()}
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