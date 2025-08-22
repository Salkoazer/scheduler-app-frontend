import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchReservation, fetchReservationHistory, type ReservationDetail, type ReservationHistoryEvent } from '../services/reservations';
import './NewReservation.css';
import enTranslations from '../locales/en.json';
import ptTranslations from '../locales/pt.json';

interface Props {
  locale: 'en' | 'pt';
}

const ReservationDetail: React.FC<Props> = ({ locale }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ReservationHistoryEvent[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!id) return;
      try {
        const res = await fetchReservation(id);
        setReservation(res);
        // Load history for that date/room (will include all events for day)
        setHistoryLoading(true);
        try {
          const events = await fetchReservationHistory(res.date, res.room);
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

  return (
    <div className="new-reservation-form" style={{ maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>{reservation.event}</h2>
      <div className="form-group"><label>{t.room || 'Room'}:</label><input value={reservation.room} readOnly /></div>
      <div className="form-group"><label>{t.nif || 'NIF'}:</label><input value={reservation.nif} readOnly /></div>
      <div className="form-group"><label>{t.producer || t.producerName || 'Producer'}:</label><input value={reservation.producerName} readOnly /></div>
      <div className="form-group"><label>{t.email || 'Email'}:</label><input value={reservation.email} readOnly /></div>
      <div className="form-group"><label>{t.contact || 'Contact'}:</label><input value={reservation.contact} readOnly /></div>
      <div className="form-group"><label>{t.responsible || t.responsablePerson || 'Responsible'}:</label><input value={reservation.responsablePerson} readOnly /></div>
      <div className="form-group"><label>{t.eventClassification || 'Event Classification'}:</label><input value={reservation.eventClassification} readOnly /></div>
      <div className="form-group"><label>{t.date || 'Date'}:</label><input value={new Date(reservation.date).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })} readOnly /></div>
      <div className="form-group"><label>{t.selectType || 'Type'}:</label><input value={reservation.type} readOnly /></div>
      <div className="form-group"><label>{t.status || 'Status'}:</label><input value={reservation.reservationStatus || 'pre'} readOnly /></div>
      {reservation.notes && (
        <div className="form-group"><label>{t.notes || 'Notes'}:</label><textarea value={reservation.notes} readOnly rows={6} /></div>
      )}
      <div className="form-buttons">
        <button type="button" onClick={() => navigate(-1)}>{t.back || 'Back'}</button>
      </div>
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
