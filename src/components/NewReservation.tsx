import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './NewReservation.css';
import enTranslations from '../locales/en.json';
import ptTranslations from '../locales/pt.json';
import { enUS, pt, Locale } from 'date-fns/locale';
import { createReservation, clearReservationCache } from '../services/reservations';
import { reservationBaseSchema, reservationPayloadSchema } from '../validation/schemas';

interface NewReservationProps {
    locale: 'en' | 'pt';
}

// Using discrete day selection (chips) similar to ReservationDetail; a single reservation with dates[]

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
    date: string;
    selectType: string;
    event: string;
    assembly: string;
    disassembly: string;
    others: string;
    placeholder: string;
    // ...other existing translation keys...
}

const NewReservation: React.FC<NewReservationProps> = ({ locale }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { room, selectedDate: initialSelectedDate, fromCalendarBox } = location.state || {
        room: 'room 1',
        selectedDate: null,
        fromCalendarBox: false
    };

    // Handle either a date-only string (YYYY-MM-DD) or a full ISO string.
    const initialDateString: string | null = (() => {
        if (!initialSelectedDate) return null;
        if (typeof initialSelectedDate === 'string') {
            if (initialSelectedDate.length === 10 && /\d{4}-\d{2}-\d{2}/.test(initialSelectedDate)) {
                return initialSelectedDate; // already date-only
            }
            const d = new Date(initialSelectedDate);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
            return null;
        }
        return null;
    })();
    
    const [selectedDays, setSelectedDays] = useState<string[]>(() => {
        if (initialDateString && fromCalendarBox) {
            return [initialDateString];
        }
        return [];
    }); // YYYY-MM-DD
    const [pendingDay, setPendingDay] = useState<string>('');
    
    const [nif, setNif] = useState('');
    const [producerName, setProducerName] = useState('');
    const [email, setEmail] = useState('');
    const [contact, setContact] = useState('');
    const [responsablePerson, setResponsablePerson] = useState('');
    const [event, setEvent] = useState('');
    const [eventClassification, setEventClassification] = useState('allAges'); // Set default value
    const [type, setType] = useState('event');
    const [notes, setNotes] = useState('');
    // author is set server-side from JWT

    const translations = locale === 'en' ? enTranslations : ptTranslations;

    const handleNifChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNif(e.target.value);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
    if (selectedDays.length === 0) { alert(translations.reservationError); return; }
    const baseValidation = reservationBaseSchema.safeParse({ room, nif, producerName, email, contact, responsablePerson, event, eventClassification });
        if (!baseValidation.success) { alert(baseValidation.error.errors[0]?.message || translations.reservationError); return; }
        // Validate first day payload representative
        const firstDate = new Date(selectedDays[0] + 'T00:00:00.000Z');
    const payloadValidation = reservationPayloadSchema.safeParse({ ...baseValidation.data, date: firstDate, type, notes });
        if (!payloadValidation.success) { alert(translations.reservationError); return; }
        try {
            const isoDays = selectedDays.map(d => new Date(d + 'T00:00:00.000Z'));
            isoDays.sort((a,b)=>a.getTime()-b.getTime());
            const reservationData = {
                room,
                nif,
                producerName,
                email,
                contact,
                responsablePerson,
                event,
                eventClassification,
                dates: isoDays,
                type,
                notes
            } as any;
            const success = await createReservation(reservationData);
            if (success) {
                // Ensure calendar refetch isn't served stale cached month snapshot
                clearReservationCache();
                alert(translations.reservationSuccess);
                navigate('/calendar', { state: { room } });
            } else {
                alert(translations.reservationError);
            }
        } catch (error) {
            console.error('Failed to submit reservation:', error);
            alert(translations.reservationError);
        }
    };

    const handleReturn = () => {
        navigate('/calendar', { state: { room } });
    };

    const isPastDate = (date: Date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date < today;
    };

    // Effect not needed for per-entry sync; single event field used for whole reservation

    const isFormValid = (): boolean => {
        if (!event.trim()) return false;
        if (selectedDays.length === 0) return false;
        const zodBaseOk = reservationBaseSchema.safeParse({ room, nif, producerName, email, contact, responsablePerson, event, eventClassification }).success;
        const zodEntriesOk = reservationPayloadSchema.safeParse({ room, nif, producerName, email, contact, responsablePerson, event, eventClassification, date: new Date(selectedDays[0] + 'T00:00:00.000Z'), type, notes }).success;
        return zodBaseOk && zodEntriesOk;
    };

    return (
    <form className="new-reservation-form" onSubmit={handleSubmit}>
            <div className="form-group">
                <label>{translations.room}:</label>
                <input type="text" value={room} readOnly />
            </div>
            {/* Reservation number removed */}
            <div className="form-group">
                <label>{translations.nif}:</label>
                <input 
                    type="text"
                    value={nif}
                    onChange={handleNifChange}
                />
            </div>
            <div className="form-group">
                <label>{translations.producerName}:</label>
                <input 
                    type="text" 
                    value={producerName} 
                    onChange={(e) => setProducerName(e.target.value)} 
                />
            </div>
            <div className="form-group">
                <label>{translations.email}:</label>
                <input 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                />
            </div>
            <div className="form-group">
                <label>{translations.contact}:</label>
                <input 
                    type="text" 
                    value={contact} 
                    onChange={(e) => setContact(e.target.value)} 
                />
            </div>
            <div className="form-group">
                <label>{translations.responsablePerson}:</label>
                <input 
                    type="text" 
                    value={responsablePerson} 
                    onChange={(e) => setResponsablePerson(e.target.value)} 
                />
            </div>
            <div className="form-group">
                <label>{translations.event}:</label>
                <input 
                    type="text" 
                    value={event} 
                    onChange={(e) => setEvent(e.target.value)} 
                />
            </div>
            <div className="form-group">
                <label>{translations.eventClassification}:</label>
                <select 
                    value={eventClassification} 
                    onChange={(e) => setEventClassification(e.target.value)}
                >
                    <option value="">{translations.selectClassification}</option>
                    <option value="allAges">{translations.allAges}</option>
                    {/* Add more options here if needed */}
                </select>
            </div>
            <div className="form-group">
                <label>{translations.scheduledDays}:</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    <input
                        type="date"
                        value={pendingDay}
                        min={new Date().toISOString().slice(0,10)}
                        onFocus={() => {
                            if (!pendingDay && selectedDays.length>0) {
                                // Bias picker to last selectedDay month by temporarily setting then clearing (if needed)
                                setPendingDay(selectedDays[selectedDays.length-1]);
                            }
                        }}
                        onChange={e => setPendingDay(e.target.value)}
                    />
                    <button
                        type="button"
                        disabled={!pendingDay || selectedDays.includes(pendingDay) || new Date(pendingDay) < new Date(new Date().toISOString().slice(0,10))}
                        onClick={() => { if (!pendingDay) return; if (selectedDays.includes(pendingDay)) return; setSelectedDays(prev => [...prev, pendingDay].sort()); setPendingDay(''); }}
                        style={{ padding:'4px 10px' }}
                    >{(translations as any).add || 'Add'}</button>
                    {selectedDays.length>0 && (
                        <button type="button" onClick={() => setSelectedDays([])} style={{ padding:'4px 10px' }}>{(translations as any).clear || 'Clear'}</button>
                    )}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
                    {selectedDays.map(d => (
                        <span key={d} style={{ background:'#eee', padding:'3px 8px', borderRadius:14, fontSize:'0.7rem', display:'inline-flex', alignItems:'center', gap:6 }}>
                            {new Date(d).toLocaleDateString(locale,{ day:'2-digit', month:'short' })}
                            <button type="button" style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:'0.75rem' }} onClick={() => setSelectedDays(prev => prev.filter(x => x!==d))}>×</button>
                        </span>
                    ))}
                </div>
                {selectedDays.length===0 && <small style={{ fontSize:'0.65rem', color:'#666' }}>{(translations as any).addDaysHint || 'Pick dates using the field above'}</small>}
            </div>
            <div className="form-group">
                <label>{translations.selectType}:</label>
                <select value={type} onChange={e => setType(e.target.value)}>
                    <option value="event">{translations.event}</option>
                    <option value="assembly">{translations.assembly}</option>
                    <option value="disassembly">{translations.disassembly}</option>
                    <option value="others">{translations.others}</option>
                </select>
            </div>
            <div className="form-group">
                <label>{translations.notes}:</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} />
            </div>
            <div className="form-buttons">
                <button 
                    type="submit" 
                    className="submit-button"
                    disabled={!isFormValid()}
                >
                    {translations.submit}
                </button>
                <button 
                    type="button" 
                    onClick={handleReturn} 
                    className="return-button"
                >
                    {translations.return}
                </button>
            </div>
        </form>
    );
};

export default NewReservation;
