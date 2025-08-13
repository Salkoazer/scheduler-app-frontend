import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Calendar.css';
import enTranslations from '../locales/en.json';
import ptTranslations from '../locales/pt.json';
import { fetchReservations, updateReservationStatus, type ReservationListItem } from '../services/reservations';
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
}

const Calendar: React.FC<CalendarProps> = ({ locale }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [reservations, setReservations] = useState<ReservationListItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedReservations, setSelectedReservations] = useState<ReservationListItem[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<string>('room 1');
    const roomOptions = ['room 1', 'room 2', 'room 3'];
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const navigate = useNavigate();

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    useEffect(() => {
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString();

        const loadReservations = async () => {
            try {
                const fetchedReservations = await fetchReservations(startOfMonth, endOfMonth);
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

    // Helper to refresh reservations for the current month
    const refreshMonthReservations = async () => {
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString();
        try {
            const fetchedReservations = await fetchReservations(startOfMonth, endOfMonth);
            setReservations(fetchedReservations);
            if (selectedDay !== null) {
                const dayReservations = fetchedReservations.filter(res => new Date(res.date).toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay).toDateString() && res.room === selectedRoom);
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
            const d = new Date(r.date);
            return d >= start && d <= end;
        });

        // Shape rows for XLS
        const rows = inMonth
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map(r => ({
                Date: new Date(r.date).toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }),
                Room: r.room,
                Event: r.event,
                Type: r.type,
                Status: r.status || '',
                ReservationStatus: r.reservationStatus || 'pre',
                Author: r.author || ''
            }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Reservations');

        const monthName = new Date(2000, month, 1).toLocaleString(locale, { month: 'long' });
        const fileName = `reservations_${monthName}_${year}.xls`;
        XLSX.writeFile(wb, fileName, { bookType: 'xls' });
        setToast({ message: 'Exported month to XLS', type: 'success' });
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
        const dayReservations = reservations.filter(res => new Date(res.date).toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toDateString() && res.room === selectedRoom);
        setSelectedReservations(dayReservations);
    };

    const closePopup = () => {
        setSelectedDay(null);
        setSelectedReservations([]);
        setError(null);
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
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
            const dayReservations = reservations.filter(res => new Date(res.date).toDateString() === date.toDateString());
            const reservation = dayReservations.find(res => res.room === selectedRoom);

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
                    className={`calendar-day ${isPastDate(i) ? 'past-date' : ''} ${reservation ? 'reservation' : ''} ${roomClass} ${statusClass}`}
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
                        <h2>{translations.reservationDay} - {selectedDay}/{currentDate.getMonth() + 1}/{currentDate.getFullYear()}</h2>
                        {error && <div className="error-message">{error}</div>}
                        <div className="popup-actions">
                            <button>{translations.notes}</button>
                            <button 
                                disabled={isPastDate(selectedDay) || selectedReservations.length > 0} 
                                onClick={() => handleNewReservation(
                                    new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay),
                                    true
                                )}
                            >
                                {translations.newReservation}
                            </button>
                            <button onClick={closePopup}>{translations.close}</button>
                        </div>
                        <hr />
                        <section>
                            <h3>{translations.activeReservations}</h3>
                            {selectedReservations.filter(res => res.status === 'active').length > 0 ? (
                                selectedReservations.filter(res => res.status === 'active').map(res => (
                                    <div className="reservation" key={res._id}>
                                        <p>{res.event}</p>
                                        {res.author ? <p>{res.author}</p> : null}
                                        <div>
                                            <label style={{ marginRight: '6px' }}>Status:</label>
                                            <select
                                                value={(!res.reservationStatus || res.reservationStatus === 'pre') ? 'pre' : 'confirmed'}
                                                onChange={async (e) => {
                                                    if (!res._id) return;
                                                    const base = e.target.value as 'pre' | 'confirmed';
                                                    const next = base === 'pre' ? 'pre' : (res.reservationStatus === 'flagged' ? 'flagged' : 'confirmed');
                                                    try {
                                                        await updateReservationStatus(res._id, next);
                                                        await refreshMonthReservations();
                                                        setToast({ message: 'Status updated', type: 'success' });
                                                    } catch {
                                                        setToast({ message: 'Failed to update status', type: 'error' });
                                                    }
                                                }}
                                            >
                                                <option value="pre">Pre-reservation</option>
                                                <option value="confirmed">Reservation</option>
                                            </select>
                                            {res.reservationStatus && res.reservationStatus !== 'pre' && (
                                                <label style={{ marginLeft: '8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={res.reservationStatus === 'flagged'}
                                                        onChange={async (e) => {
                                                            if (!res._id) return;
                                                            const next = e.target.checked ? 'flagged' as const : 'confirmed' as const;
                                                            try {
                                                                await updateReservationStatus(res._id, next);
                                                                await refreshMonthReservations();
                                                                setToast({ message: 'Status updated', type: 'success' });
                                                            } catch {
                                                                setToast({ message: 'Failed to update status', type: 'error' });
                                                            }
                                                        }}
                                                    />
                                                    <span>Flagged (paid)</span>
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p>No active reservations</p>
                            )}
                        </section>
                        <hr />
                        <section>
                            <h3>{translations.inactiveReservations}</h3>
                            {selectedReservations.filter(res => res.status !== 'active').length > 0 ? (
                                selectedReservations.filter(res => res.status !== 'active').map(res => (
                                    <div className="reservation" key={res._id}>
                                        <p>{res.event}</p>
                                        {res.author ? <p>{res.author}</p> : null}
                                        <div>
                                            <label style={{ marginRight: '6px' }}>Status:</label>
                                            <select
                                                value={(!res.reservationStatus || res.reservationStatus === 'pre') ? 'pre' : 'confirmed'}
                                                onChange={async (e) => {
                                                    if (!res._id) return;
                                                    const base = e.target.value as 'pre' | 'confirmed';
                                                    const next = base === 'pre' ? 'pre' : (res.reservationStatus === 'flagged' ? 'flagged' : 'confirmed');
                                                    try {
                                                        await updateReservationStatus(res._id, next);
                                                        await refreshMonthReservations();
                                                        setToast({ message: 'Status updated', type: 'success' });
                                                    } catch {
                                                        setToast({ message: 'Failed to update status', type: 'error' });
                                                    }
                                                }}
                                            >
                                                <option value="pre">Pre-reservation</option>
                                                <option value="confirmed">Reservation</option>
                                            </select>
                                            {res.reservationStatus && res.reservationStatus !== 'pre' && (
                                                <label style={{ marginLeft: '8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={res.reservationStatus === 'flagged'}
                                                        onChange={async (e) => {
                                                            if (!res._id) return;
                                                            const next = e.target.checked ? 'flagged' as const : 'confirmed' as const;
                                                            try {
                                                                await updateReservationStatus(res._id, next);
                                                                await refreshMonthReservations();
                                                                setToast({ message: 'Status updated', type: 'success' });
                                                            } catch {
                                                                setToast({ message: 'Failed to update status', type: 'error' });
                                                            }
                                                        }}
                                                    />
                                                    <span>Flagged (paid)</span>
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p>No inactive reservations</p>
                            )}
                        </section>
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