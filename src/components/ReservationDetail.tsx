import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchReservation, fetchReservationHistory, updateReservation, type ReservationDetail, type ReservationHistoryEvent } from '../services/reservations';
import './NewReservation.css';
import enTranslations from '../locales/en.json';
import ptTranslations from '../locales/pt.json';

interface Props {
  locale: 'en' | 'pt';
  username?: string | null;
  role?: 'admin' | 'staff' | null;
}

const ReservationDetail: React.FC<Props> = ({ locale, username, role }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ReservationHistoryEvent[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ReservationDetail>>({});
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  // We now exclusively use a discrete day selection model (even for contiguous ranges)
  const [selectedDays, setSelectedDays] = useState<string[]>([]); // YYYY-MM-DD strings
  const [pendingDay, setPendingDay] = useState<string>(''); // holds the currently chosen (not yet added) day

  useEffect(() => {
    const run = async () => {
      if (!id) return;
      try {
  const res = await fetchReservation(id);
        if (process.env.NODE_ENV !== 'production') {
          console.log('[ReservationDetail] fetched', {
            id: res._id,
            dates: (res as any).dates,
            room: res.room
          });
        }
  setReservation(res);
          setForm({
            room: res.room,
            dates: res.dates || [],
            nif: res.nif || '',
            producerName: res.producerName || '',
            email: res.email || '',
            contact: res.contact || '',
            responsablePerson: res.responsablePerson || '',
            event: res.event || '',
            eventClassification: res.eventClassification || '',
            type: res.type || '',
            notes: res.notes || ''
          } as any);
  // Initialize discrete date list
  const anyRes: any = res;
    let dayList: string[] = [];
    if (Array.isArray(anyRes.dates) && anyRes.dates.length > 0) {
      dayList = anyRes.dates.map((d: string) => new Date(d).toISOString().slice(0,10));
    } else if (anyRes.date) { // legacy fallback
      dayList = [new Date(anyRes.date).toISOString().slice(0,10)];
    }
  dayList = Array.from(new Set(dayList)).sort();
  setSelectedDays(dayList);
        // Load history for that date/room (will include all events for day)
        setHistoryLoading(true);
        try {
          // Use first date in dates[] for history lookup (legacy API expects a single date parameter)
          const historyDate = (res as any).date || (res.dates && res.dates.length > 0 ? res.dates[0] : undefined);
          const events = historyDate ? await fetchReservationHistory(historyDate, res.room) : [];
          // Filter events for this reservation if reservationId stored
          const filtered = events.filter(ev => !ev.reservationId || ev.reservationId === res._id);
          setHistory(filtered);
        } catch (h) {
          setHistoryError('Failed to load history');
        } finally {
          setHistoryLoading(false);
        }
      } catch (e: any) {
        setError(e?.response?.status === 404 ? 'Not found' : 'Failed to load reservation');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [id]);

  const t: any = locale === 'pt' ? ptTranslations : enTranslations;

  if (loading) return <div style={{ padding: 16 }}>{t.loading || 'Loading...'}</div>;
  if (error) return <div style={{ padding: 16 }}>{error}</div>;
  if (!reservation) return null;

  const canEdit = !!reservation && (role === 'admin' || (role === 'staff' && username && reservation.author && reservation.author.toLowerCase() === username.toLowerCase()));
  const startEdit = () => { if (canEdit) { 
    // clone to avoid mutating original reservation reference (so changes are detected)
    setForm({ ...(reservation as any), dates: reservation.dates ? [...reservation.dates] : [] } as any); 
    setEditMode(true); setSaveMsg(null); // rebuild day list for safety
    const anyRes: any = reservation;
    let list: string[] = [];
    if (Array.isArray(anyRes.dates) && anyRes.dates.length > 0) {
      list = anyRes.dates.map((d: string) => new Date(d).toISOString().slice(0,10));
    } else if (anyRes.date) { list = [new Date(anyRes.date).toISOString().slice(0,10)]; }
    list = Array.from(new Set(list)).sort(); setSelectedDays(list); } };
  const cancelEdit = () => { setEditMode(false); setForm({ ...(reservation as any), dates: reservation.dates ? [...reservation.dates] : [] } as any); setSaveMsg(null);} ;
  const handleChange = (field: keyof ReservationDetail, value: any) => {
    setForm(f => ({ ...f, [field]: value }));
  };
  const handleSave = async () => {
    if (!reservation || !canEdit) return;
    setSaving(true); setSaveMsg(null);
    try {
      if (selectedDays.length === 0) throw new Error('Select at least one day');
  const isoDays = selectedDays.map(d => new Date(d + 'T00:00:00.000Z').toISOString());
  const payload: any = {};
  const fields: (keyof ReservationDetail | 'room' | 'dates')[] = ['room','nif','producerName','email','contact','responsablePerson','event','eventClassification','type','notes'];
  // compare scalar fields
  fields.forEach(k => { if ((form as any)[k] !== (reservation as any)[k]) payload[k] = (form as any)[k]; });
  // handle dates separately (deep compare)
  const currentDates = Array.isArray(reservation.dates) ? reservation.dates.map(d=>d) : [];
  const newDates = isoDays;
  const datesChanged = currentDates.length !== newDates.length || currentDates.some((d,i)=>d!==newDates[i]);
  if (datesChanged) payload.dates = newDates;
      if (Object.keys(payload).length === 0) { setSaveMsg(t.nothingToSave || 'Nothing to save'); setSaving(false); setEditMode(false); return; }
      await updateReservation(reservation._id!, payload);
      const updated = { ...reservation, ...payload } as ReservationDetail;
      setReservation(updated);
  // refresh form with cloned updated values
  setForm({ ...(updated as any), dates: updated.dates ? [...updated.dates] : [] } as any);
  setEditMode(false);
      setSaveMsg(t.saved || 'Saved');
    } catch (e:any) {
      setSaveMsg(t.saveFailed || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="new-reservation-form" style={{ maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>{reservation.event}</h2>
  <div className="form-group"><label>{t.room || 'Room'}:</label>{editMode ? (
    <select value={(form as any).room || reservation.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))}>
      <option value="room 1">Room 1</option>
      <option value="room 2">Room 2</option>
      <option value="room 3">Room 3</option>
    </select>
  ) : <input value={reservation.room || ''} readOnly />}</div>
      <div className="form-group"><label>{t.nif || 'NIF'}:</label><input value={reservation.nif || ''} readOnly /></div>
  <div className="form-group"><label>{t.producer || t.producerName || 'Producer'}:</label><input value={editMode ? (form.producerName ?? '') : (reservation.producerName || '')} onChange={e => editMode && handleChange('producerName', e.target.value)} readOnly={!editMode} /></div>
  <div className="form-group"><label>{t.email || 'Email'}:</label><input value={editMode ? (form.email ?? '') : (reservation.email || '')} onChange={e => editMode && handleChange('email', e.target.value)} readOnly={!editMode} /></div>
  <div className="form-group"><label>{t.contact || 'Contact'}:</label><input value={editMode ? (form.contact ?? '') : (reservation.contact || '')} onChange={e => editMode && handleChange('contact', e.target.value)} readOnly={!editMode} /></div>
  <div className="form-group"><label>{t.responsible || t.responsablePerson || 'Responsible'}:</label><input value={editMode ? (form.responsablePerson ?? '') : (reservation.responsablePerson || '')} onChange={e => editMode && handleChange('responsablePerson', e.target.value)} readOnly={!editMode} /></div>
      <div className="form-group"><label>{t.eventClassification || 'Event Classification'}:</label>
        {editMode ? (
          <input value={form.eventClassification || ''} onChange={e => handleChange('eventClassification', e.target.value)} />
        ) : (
          <input value={reservation.eventClassification || ''} readOnly />
        )}
      </div>
      <div className="form-group"><label>{t.date || 'Date'}:</label>
        {editMode ? (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
              <input
                type="date"
                value={pendingDay}
                onFocus={() => {
                  if (!pendingDay && selectedDays.length > 0) {
                    // Use last selected day to bias picker to most recent month
                    setPendingDay(selectedDays[selectedDays.length - 1]);
                  }
                }}
                onChange={e => setPendingDay(e.target.value)}
              />
              <button
                type="button"
                style={{ fontSize:'0.65rem', padding:'4px 8px' }}
                onClick={() => {
                  if (!pendingDay) return;
                  setSelectedDays(prev => prev.includes(pendingDay) ? prev : [...prev, pendingDay].sort());
                  setPendingDay('');
                }}
                disabled={!pendingDay || selectedDays.includes(pendingDay)}
              >{t.add || 'Add'}</button>
              {selectedDays.length>0 && <button type="button" style={{ fontSize:'0.65rem', padding:'4px 8px' }} onClick={() => setSelectedDays([])}>{t.clear || 'Clear'}</button>}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {selectedDays.map(d => (
                <span key={d} style={{ background:'#eee', padding:'2px 6px', borderRadius:12, fontSize:'0.65rem', display:'inline-flex', alignItems:'center', gap:4 }}>
                  {new Date(d).toLocaleDateString(locale,{ day:'2-digit', month:'short' })}
                  <button type="button" style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:'0.7rem' }} onClick={() => setSelectedDays(prev => prev.filter(x => x!==d))}>×</button>
                </span>
              ))}
            </div>
            {selectedDays.length===0 && <small style={{ fontSize:'0.65rem', color:'#666' }}>{t.addDaysHint || 'Pick dates (use field above to add more)'}</small>}
            {selectedDays.length>1 && (
              <small style={{ fontSize:'0.7rem', color:'#555' }}>
                {new Date(selectedDays[0]).toLocaleDateString(locale,{ day:'2-digit', month:'short', year:'numeric' })}
                {' … '}
                {new Date(selectedDays[selectedDays.length-1]).toLocaleDateString(locale,{ day:'2-digit', month:'short', year:'numeric' })}
              </small>
            )}
          </div>
        ) : (
          (() => {
            const anyRes: any = reservation;
            const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
            let display = '';
            if (anyRes.dates && anyRes.dates.length > 0) {
              const sorted = [...anyRes.dates].map((d: string) => new Date(d)).sort((a,b)=>a.getTime()-b.getTime());
              const parts = sorted.map(d => fmt(d));
              if (parts.length === 1) display = parts[0];
              else if (parts.length <= 4) display = parts.join(', ');
              else display = parts.slice(0,3).join(', ') + ` +${parts.length-3}`;
            }
            return <input value={display} readOnly />;
          })()
        )}
      </div>
      <div className="form-group"><label>{t.selectType || 'Type'}:</label>
        {editMode ? (
          <select value={form.type || ''} onChange={e => handleChange('type', e.target.value as any)}>
            <option value="event">event</option>
            <option value="assembly">assembly</option>
            <option value="disassembly">disassembly</option>
            <option value="others">others</option>
          </select>
        ) : (
          <input value={reservation.type || ''} readOnly />
        )}
      </div>
  <div className="form-group"><label>{t.status || 'Status'}:</label><input value={(reservation.reservationStatus || 'pre')} readOnly /></div>
      <div className="form-group"><label>{t.notes || 'Notes'}:</label>
        {editMode ? (
          <textarea value={form.notes || ''} onChange={e => handleChange('notes', e.target.value)} rows={6} />
        ) : (
          <textarea value={reservation.notes || ''} readOnly rows={6} />
        )}
      </div>
  <div className="form-buttons" style={{ display: 'flex', gap: 12 }}>
        <button type="button" onClick={() => navigate(-1)}>{t.back || 'Back'}</button>
        {canEdit && !editMode && (
          <button type="button" onClick={startEdit}>{t.edit || 'Edit'}</button>
        )}
        {editMode && (
          <>
            <button type="button" disabled={saving} onClick={handleSave}>{saving ? (t.saving || 'Saving...') : (t.save || 'Save')}</button>
            <button type="button" disabled={saving} onClick={cancelEdit}>{t.cancel || 'Cancel'}</button>
          </>
        )}
      </div>
      {saveMsg && <div style={{ marginTop:8, fontSize:'0.8rem' }}>{saveMsg}</div>}
      <hr />
      <h3 style={{ marginTop: 24 }}>{t.history || 'History'}</h3>
      {historyLoading && <div>{t.loadingHistory || 'Loading history...'}</div>}
      {historyError && <div>{historyError}</div>}
      {!historyLoading && !historyError && history.length === 0 && <div>{t.noHistoryEntries || 'No history entries'}</div>}
      {!historyLoading && !historyError && history.length > 0 && (
        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>{t.time || 'Time'}</th>
              <th style={{ textAlign: 'left' }}>{t.user || 'User'}</th>
              <th style={{ textAlign: 'left' }}>{t.action || 'Action'}</th>
              <th style={{ textAlign: 'left' }}>{t.from || 'From'}</th>
              <th style={{ textAlign: 'left' }}>{t.to || 'To'}</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i} style={i < history.length - 1 ? { borderBottom: '1px solid #eee' } : undefined}>
                <td>{new Date(h.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                <td>{h.user || ''}</td>
                <td>{h.action}</td>
                <td>{h.fromStatus || ''}</td>
                <td>{h.toStatus || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ReservationDetail;
