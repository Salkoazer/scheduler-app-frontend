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

interface DayClearNotification {
    id: string;
    room: string;
    dateISO: string; // midnight ISO of the day
    dayKey: string; // YYYY-MM-DD
    message: string;
    createdAt: number;
}

interface CalendarProps {
    locale: 'en' | 'pt';
    username?: string | null;
    role?: 'admin' | 'staff' | null;
    onDayClear?(notifs: DayClearNotification[]): void; // emit newly detected notifications
    openDayRequest?: { room: string; dateISO: string; nonce: number } | null;
    onConsumeOpenDayRequest?: () => void;
    seenDayClearKeys?: string[]; // room|dayKey already seen (persisted) to suppress
}

const Calendar: React.FC<CalendarProps> = ({ locale, username, role, onDayClear, openDayRequest, onConsumeOpenDayRequest, seenDayClearKeys }) => {
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
    // Count of user pre-reservations that are currently blocked by a confirmed/flagged reservation (same room+day)
    const [blockedPreCount, setBlockedPreCount] = useState(0);
    // Per-reservation notes state
    const [notesState, setNotesState] = useState<Record<string, { open: boolean; draft: string; baseline: string; saving: boolean }>>({});
    const [deleteChoiceFor, setDeleteChoiceFor] = useState<string | null>(null); // reservation id awaiting delete scope choice
    const navigate = useNavigate();
    // Track previously occupied (confirmed/flagged) day+room combinations to detect clearing events
    const prevOccupiedRef = React.useRef<Set<string>>(new Set());
    // Track which authors (lowercased) previously occupied a room|dayKey (confirmed/flagged) so we can avoid notifying them when they themselves vacate it
    const prevOccupiedAuthorsRef = React.useRef<Map<string, Set<string>>>(new Map());
    const notifiedDaysRef = React.useRef<Set<string>>(new Set()); // room|dayKey already notified
    const pendingOpenRef = React.useRef<{ room: string; day: number; year: number; month: number } | null>(null);
    // Seed internal notifiedDaysRef with already seen keys (one-time / whenever prop changes)
    useEffect(() => {
        if (!seenDayClearKeys || !seenDayClearKeys.length) return;
        seenDayClearKeys.forEach(k => notifiedDaysRef.current.add(k));
    }, [seenDayClearKeys]);

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
                // After setting reservations, detect day-clear events
                detectDayClearEvents(fetchedReservations);
                // If there is a pending open day request and month matches, open it
                if (pendingOpenRef.current) {
                    const { year, month, day, room } = pendingOpenRef.current;
                    if (year === currentDate.getFullYear() && month === currentDate.getMonth()) {
                        if (selectedRoom !== room) setSelectedRoom(room);
                        handleDayClick(day);
                        pendingOpenRef.current = null;
                        onConsumeOpenDayRequest && onConsumeOpenDayRequest();
                    }
                }
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

    // Silent background auto-refresh (5–10 min jitter) to keep users in sync
    useEffect(() => {
        let cancelled = false;
        let timeoutId: any;

        const minMs = 5 * 60 * 1000; // 5 minutes
        const maxMs = 10 * 60 * 1000; // 10 minutes

        const schedule = () => {
            const jitter = Math.random() * (maxMs - minMs) + minMs;
            timeoutId = setTimeout(async () => {
                if (cancelled) return;
                // Basic guard: avoid refresh while any notes editor is in saving state
                const hasSaving = Object.values(notesState).some(s => s.saving);
                if (!hasSaving) {
                    try {
                        await refreshMonthReservations();
                        if (process.env.NODE_ENV !== 'production') {
                            console.log('[AutoRefresh] Month silently refreshed');
                        }
                    } catch (e) {
                        if (process.env.NODE_ENV !== 'production') {
                            console.warn('[AutoRefresh] Refresh failed', e);
                        }
                    }
                } else if (process.env.NODE_ENV !== 'production') {
                    console.log('[AutoRefresh] Skipped due to active save');
                }
                if (!cancelled) schedule();
            }, jitter);
        };

        schedule();
        return () => { cancelled = true; if (timeoutId) clearTimeout(timeoutId); };
        // Recreate timer if month changes (so interval realigns) or notesState object identity changes drastically
    }, [currentDate, notesState]);

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
            detectDayClearEvents(fetchedReservations);
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

    // Derive how many of the current user's pre-reservations are blocked by an occupied (confirmed/flagged) reservation.
    useEffect(() => {
        if (!username) { setBlockedPreCount(0); return; }
        const userLc = username.toLowerCase();
        const userPre = new Set<string>(); // room|dayKey where user has pre
        const occupied = new Set<string>(); // room|dayKey occupied by confirmed/flagged
        reservations.forEach(r => {
            const datesArr: string[] = Array.isArray((r as any).dates) ? (r as any).dates : [];
            datesArr.forEach(d => {
                const dayKey = d.slice(0,10);
                const key = `${r.room}|${dayKey}`;
                if (r.reservationStatus && r.reservationStatus !== 'pre') {
                    occupied.add(key);
                } else if ((!r.reservationStatus || r.reservationStatus === 'pre') && r.author && r.author.toLowerCase() === userLc) {
                    userPre.add(key);
                }
            });
        });
        let blocked = 0;
        userPre.forEach(k => { if (occupied.has(k)) blocked++; });
        if (process.env.NODE_ENV !== 'production') {
            if (blocked !== blockedPreCount) console.log('[FocusedRefresh] blockedPreCount ->', blocked);
        }
        setBlockedPreCount(blocked);
    }, [reservations, username]);

    // Focused short-interval refresh: if user has any blocked pre-reservations, poll current month more frequently (every 60s)
    // to promptly detect when the day clears (e.g., admin demotes/deletes competing reservation) instead of waiting 5–10m auto-refresh.
    useEffect(() => {
        if (!username) return; // no user, no polling
        if (blockedPreCount === 0) return; // nothing blocked, no need for rapid polling
        let cancelled = false;
        let timer: any;
        const poll = async () => {
            if (cancelled) return;
            try {
                await refreshMonthReservations();
            } catch (e) {
                if (process.env.NODE_ENV !== 'production') console.warn('[FocusedRefresh] month refresh failed', e);
            } finally {
                if (!cancelled && blockedPreCount > 0) {
                    timer = setTimeout(poll, 60 * 1000); // 60s
                }
            }
        };
        timer = setTimeout(poll, 60 * 1000); // start after 60s to avoid immediate duplicate fetch after status change
        if (process.env.NODE_ENV !== 'production') console.log('[FocusedRefresh] started (blockedPreCount=', blockedPreCount, ')');
        return () => { cancelled = true; if (timer) clearTimeout(timer); if (process.env.NODE_ENV !== 'production') console.log('[FocusedRefresh] stopped'); };
    }, [blockedPreCount, username]);

    // Detect transitions where a previously occupied (confirmed/flagged) day becomes clear and user has a pre-reservation there
    const detectDayClearEvents = (fetched: ReservationListItem[]) => {
        if (!username) return;
        // translations pulled via closure from outer scope
        const currentOccupied = new Set<string>(); // room|dayKey
        const currentOccupiedAuthors = new Map<string, Set<string>>(); // room|dayKey -> set(authors)
        const userPreByDay = new Map<string, { room: string; dateISO: string }>(); // dayKey|room -> meta
        fetched.forEach(r => {
            const datesArr: string[] = Array.isArray((r as any).dates) ? (r as any).dates : [];
            datesArr.forEach(d => {
                const dayKey = d.slice(0,10);
                const key = `${r.room}|${dayKey}`;
                if (r.reservationStatus && r.reservationStatus !== 'pre') {
                    currentOccupied.add(key);
                    if (r.author) {
                        const lc = r.author.toLowerCase();
                        if (!currentOccupiedAuthors.has(key)) currentOccupiedAuthors.set(key, new Set());
                        currentOccupiedAuthors.get(key)!.add(lc);
                    }
                } else if ((!r.reservationStatus || r.reservationStatus === 'pre') && r.author && r.author.toLowerCase() === username.toLowerCase()) {
                    // user pre-reservation candidate
                    if (!userPreByDay.has(key)) {
                        userPreByDay.set(key, { room: r.room, dateISO: dayKey + 'T00:00:00.000Z' });
                    }
                }
            });
        });
        const prev = prevOccupiedRef.current;
        const prevAuthors = prevOccupiedAuthorsRef.current;
        const newlyClear: DayClearNotification[] = [];
        userPreByDay.forEach((meta, key) => {
            if (prev.has(key) && !currentOccupied.has(key) && !notifiedDaysRef.current.has(key)) {
                const [room, dayKey] = key.split('|');
                // Skip if user themselves authored the previously occupying reservation (avoid self-notify)
                const authorsSet = prevAuthors.get(key);
                if (authorsSet && authorsSet.has(username.toLowerCase())) {
                    return; // don't notify author of vacated reservation
                }
                const dt = new Date(meta.dateISO);
                const formatPart = (n:number) => String(n).padStart(2,'0');
                const template = (translations as any).notifDayClearSingle || 'Day {{DAY}}/{{MONTH}}/{{YEAR}} is now clear of reservations, click to see';
                const msg = template.replace('{{DAY}}', formatPart(dt.getDate())).replace('{{MONTH}}', formatPart(dt.getMonth()+1)).replace('{{YEAR}}', String(dt.getFullYear()));
                newlyClear.push({ id: key + '|' + Date.now(), room, dateISO: meta.dateISO, dayKey, message: msg, createdAt: Date.now() });
                notifiedDaysRef.current.add(key);
            }
        });
        prevOccupiedRef.current = currentOccupied; // replace reference
        prevOccupiedAuthorsRef.current = currentOccupiedAuthors; // replace authors snapshot
        if (newlyClear.length && onDayClear) {
            onDayClear(newlyClear);
        }
    };

    // Wide sweep: periodically fetch previous, current, and next month to detect clears outside viewed month (12–15 min jitter)
    useEffect(() => {
        if (!username) return;
        let stopped = false;
        let to: any;
    const INITIAL_DELAY_MS = 5000; // delay first wide sweep 5s to avoid login burst
        const sweep = async () => {
            if (stopped) return;
            const baseYear = currentDate.getFullYear();
            const baseMonth = currentDate.getMonth();
            const months = [0,-1,1].map(delta => new Date(baseYear, baseMonth + delta, 1));
            try {
                for (const m of months) {
                    const s = new Date(m.getFullYear(), m.getMonth(), 1).toISOString();
                    const e = new Date(m.getFullYear(), m.getMonth()+1, 0).toISOString();
                    const fetched = await fetchReservations(s, e);
                    detectDayClearEvents(fetched);
                }
            } catch (e) {
                if (process.env.NODE_ENV !== 'production') console.warn('[WideSweep] failed', e);
            } finally {
                const jitter = 12*60*1000 + Math.random()*3*60*1000; // 12–15 min
                to = setTimeout(sweep, jitter);
            }
        };
    to = setTimeout(sweep, INITIAL_DELAY_MS);
        return () => { stopped = true; if (to) clearTimeout(to); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [username]);

    // Horizon sweep: fetch from today forward 5 years (partitioned by year to respect 366-day API range guard) to build a global occupancy baseline
    // Runs on mount and then every ~6–7 hours with jitter. This lets us detect clears far in the future once they happen.
    useEffect(() => {
        if (!username) return;
        let cancelled = false;
        let timer: any;
        const HORIZON_YEARS = 5;
    const INITIAL_DELAY_MS = 15000; // delay horizon sweep 15s to avoid stacking with initial + wide sweep
        const runHorizonSweep = async () => {
            if (cancelled) return;
            try {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight local (backend normalizes)
                const horizonEnd = new Date(start.getFullYear() + HORIZON_YEARS, start.getMonth(), start.getDate()); // exclusive end
                // Build contiguous, non-overlapping year (or partial) ranges up to horizonEnd (inclusive days)
                const ranges: { start: Date; end: Date }[] = [];
                let cursor = new Date(start);
                while (cursor < horizonEnd) {
                    const yearEnd = new Date(cursor.getFullYear(), 11, 31, 23, 59, 59, 999);
                    const rangeEnd = yearEnd < horizonEnd ? yearEnd : new Date(horizonEnd.getFullYear(), horizonEnd.getMonth(), horizonEnd.getDate(), 23, 59, 59, 999);
                    ranges.push({ start: new Date(cursor), end: rangeEnd });
                    // Advance to Jan 1 of next year
                    cursor = new Date(rangeEnd.getFullYear() + 1, 0, 1);
                }
                const aggregate: ReservationListItem[] = [];
                for (const r of ranges) {
                    const part = await fetchReservations(r.start.toISOString(), r.end.toISOString());
                    aggregate.push(...part);
                }
                // Single detection pass using entire horizon snapshot (prevents overwriting prevOccupiedRef per-chunk)
                detectDayClearEvents(aggregate);
                if (process.env.NODE_ENV !== 'production') {
                    console.log('[HorizonSweep] Completed 5-year forward sweep over', ranges.length, 'ranges');
                }
            } catch (e) {
                if (process.env.NODE_ENV !== 'production') console.warn('[HorizonSweep] failed', e);
            } finally {
                if (!cancelled) {
                    const base = 6 * 60 * 60 * 1000; // 6h
                    const jitter = Math.random() * 60 * 60 * 1000; // +0–1h
                    timer = setTimeout(runHorizonSweep, base + jitter);
                }
            }
        };
    timer = setTimeout(runHorizonSweep, INITIAL_DELAY_MS);
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [username]);

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
        // Use a date-only string (YYYY-MM-DD) to avoid timezone shifting when later parsed.
        const dateOnly = date ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` : null;
        navigate('/new-reservation', {
            state: {
                selectedDate: dateOnly, // pass date-only (no TZ) to prevent off-by-one errors
                room: selectedRoom,
                fromCalendarBox: fromPopup
            }
        });
    };

    // Respond to external open day request (from notification click)
    useEffect(() => {
        if (!openDayRequest) return;
        const dt = new Date(openDayRequest.dateISO);
        if (isNaN(dt.getTime())) return;
        const year = dt.getFullYear();
        const month = dt.getMonth();
        const day = dt.getDate();
        // If different month, set pending and move month; will open after reservations load
        pendingOpenRef.current = { room: openDayRequest.room, day, year, month };
        if (selectedRoom !== openDayRequest.room) setSelectedRoom(openDayRequest.room);
        if (currentDate.getFullYear() !== year || currentDate.getMonth() !== month) {
            setCurrentDate(new Date(year, month, 1));
        } else {
            handleDayClick(day);
            onConsumeOpenDayRequest && onConsumeOpenDayRequest();
            pendingOpenRef.current = null;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openDayRequest]);

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
                            let prevStatus: any = undefined;
                            try {
                                // Capture previous status for revert
                                setReservations(prev => prev.map(r => {
                                    if (r._id === id) { prevStatus = r.reservationStatus; return { ...r, reservationStatus: next }; }
                                    return r;
                                }));
                                if (selectedDay !== null) {
                                    setSelectedReservations(prev => prev.map(r => {
                                        if (r._id === id) return { ...r, reservationStatus: next };
                                        return r;
                                    }));
                                }
                                await updateReservationStatus(id, next);
                                // Force a fresh refetch (bypass cache) of current month to reflect any side effects
                                const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
                                const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString();
                                const fresh = await fetchReservations(startOfMonth, endOfMonth, { noCache: true });
                                setReservations(fresh);
                                detectDayClearEvents(fresh);
                                if (selectedDay !== null) {
                                    const targetKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`;
                                    const dayReservations = fresh.filter(res => {
                                        const datesArr: string[] = Array.isArray((res as any).dates) ? (res as any).dates : [];
                                        const match = datesArr.some(d => d.slice(0,10) === targetKey);
                                        return match && res.room === selectedRoom;
                                    });
                                    setSelectedReservations(dayReservations);
                                }
                                setToast({ message: (translations as any).statusUpdated || 'Status updated', type: 'success' });
                            } catch (err: any) {
                                // Revert to previous status if known
                                setReservations(prev => prev.map(r => r._id === id ? { ...r, reservationStatus: prevStatus } : r));
                                if (selectedDay !== null) setSelectedReservations(prev => prev.map(r => r._id === id ? { ...r, reservationStatus: prevStatus } : r));
                                if (err?.response?.status === 409) {
                                    setToast({ message: (translations as any).statusConflict || 'Another confirmed/flagged reservation exists for this day & room', type: 'error' });
                                } else {
                                    setToast({ message: (translations as any).statusUpdateFailed || 'Failed to update status', type: 'error' });
                                }
                            }
                        }}
                        onFlagToggle={async (id, checked) => {
                            try {
                                const nextStatus = checked ? 'flagged' : 'confirmed';
                                setReservations(prev => prev.map(r => r._id === id ? { ...r, reservationStatus: nextStatus } : r));
                                if (selectedDay !== null) {
                                    setSelectedReservations(prev => prev.map(r => r._id === id ? { ...r, reservationStatus: nextStatus } : r));
                                }
                                await updateReservationStatus(id, checked ? 'flagged' : 'confirmed');
                                const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
                                const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString();
                                const fresh = await fetchReservations(startOfMonth, endOfMonth, { noCache: true });
                                setReservations(fresh);
                                detectDayClearEvents(fresh);
                                if (selectedDay !== null) {
                                    const targetKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`;
                                    const dayReservations = fresh.filter(res => {
                                        const datesArr: string[] = Array.isArray((res as any).dates) ? (res as any).dates : [];
                                        const match = datesArr.some(d => d.slice(0,10) === targetKey);
                                        return match && res.room === selectedRoom;
                                    });
                                    setSelectedReservations(dayReservations);
                                }
                                setToast({ message: (translations as any).statusUpdated || 'Status updated', type: 'success' });
                            } catch {
                                // On failure we simply refresh to restore server truth
                                setToast({ message: (translations as any).statusUpdateFailed || 'Failed to update status', type: 'error' });
                                await refreshMonthReservations();
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