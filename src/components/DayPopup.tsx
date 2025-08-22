import React from 'react';
import { ReservationListItem, ReservationHistoryEvent } from '../services/reservations';
import ReservationCard, { NotesStateEntry } from './ReservationCard';

interface DayPopupProps {
  day: number;
  currentDate: Date;
  translations: any;
  reservations: ReservationListItem[];
  reservationEntry: ReservationListItem | undefined;
  preEntries: ReservationListItem[];
  anyConfirmed: boolean;
  notesState: Record<string, NotesStateEntry>;
  toggleNotes(res: ReservationListItem): void;
  updateDraft(id: string, val: string): void;
  resetDraft(id: string): void;
  saveNotes(res: ReservationListItem): void;
  role: 'admin' | 'staff' | null | undefined;
  username: string | null | undefined;
  onNewReservation(): void;
  onClose(): void;
  onStatusChange(id: string, next: 'pre' | 'confirmed' | 'flagged'): Promise<void>;
  onFlagToggle(id: string, next: boolean): Promise<void>;
  onDelete(id: string): Promise<void>;
  onDeleteDay(id: string): Promise<void>;
  deleteChoiceFor: string | null;
  setDeleteChoiceFor(id: string | null): void;
  targetDayKey: string | null;
  historyOpen: boolean;
  toggleHistory(): void;
  historyLoading: boolean;
  historyError: string | null;
  historyEvents: ReservationHistoryEvent[] | null;
  loadHistory(): void;
  navigateTo(id: string): void;
}

const DayPopup: React.FC<DayPopupProps> = (props) => {
  const { day, currentDate, translations, reservationEntry, preEntries, anyConfirmed, notesState, toggleNotes, updateDraft, resetDraft, saveNotes, role, username, onNewReservation, onClose, onStatusChange, onFlagToggle, onDelete, onDeleteDay, deleteChoiceFor, setDeleteChoiceFor, targetDayKey, historyOpen, toggleHistory, historyLoading, historyError, historyEvents, loadHistory, navigateTo } = props;

  return (
    <div className="popup">
      <div className="popup-content">
        <h2>{translations.reservationDay} - {String(day).padStart(2,'0')}/{String(currentDate.getMonth()+1).padStart(2,'0')}/{currentDate.getFullYear()}</h2>
        <div className="popup-actions" style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          <button onClick={onNewReservation}>{translations.newReservation}</button>
          <button onClick={() => { if (!historyOpen) loadHistory(); toggleHistory(); }}>
            {historyOpen ? (translations as any).hideHistory || 'Hide History' : (translations as any).history || 'History'}
          </button>
          <button onClick={onClose}>{translations.close}</button>
        </div>
        <hr />
        <section>
          <h3>{(translations as any).reservationSingular || 'Reservation'}</h3>
          {reservationEntry ? (
            <ReservationCard
              variant="primary"
              res={reservationEntry}
              role={role}
              username={username}
              translations={translations}
              notesState={notesState}
              toggleNotes={toggleNotes}
              updateDraft={updateDraft}
              resetDraft={resetDraft}
              saveNotes={saveNotes}
              navigateTo={navigateTo}
              onStatusChange={onStatusChange}
              onFlagToggle={(id, val) => onFlagToggle(id, val)}
            />
          ) : <p>{(translations as any).noReservation || 'No reservation'}</p>}
        </section>
        <hr />
        <section>
          <h3>{(translations as any).preReservations || 'Pre-Reservations'}</h3>
          {preEntries.length > 0 ? preEntries.map(r => (
            <ReservationCard
              key={r._id}
              variant="pre"
              res={r}
              role={role}
              username={username}
              translations={translations}
              notesState={notesState}
              toggleNotes={toggleNotes}
              updateDraft={updateDraft}
              resetDraft={resetDraft}
              saveNotes={saveNotes}
              navigateTo={navigateTo}
              anyConfirmed={anyConfirmed}
              onStatusChange={onStatusChange}
              canDelete={!!((role === 'admin') || (role === 'staff' && username && r.author && username.toLowerCase() === r.author.toLowerCase()))}
              showDeleteChoices={deleteChoiceFor === r._id}
              startDeleteChoices={() => setDeleteChoiceFor(r._id || null)}
              cancelDeleteChoices={() => setDeleteChoiceFor(null)}
              multiDay={Array.isArray((r as any).dates) && (r as any).dates.length > 1}
              targetDayKey={targetDayKey}
              onDelete={async (id) => {
                const multi = Array.isArray((r as any).dates) && (r as any).dates.length > 1;
                const msg = multi
                  ? (translations as any).confirmDeletePreAll || 'Delete all days for this pre-reservation?'
                  : (translations as any).confirmDeletePreSingle || 'Delete this pre-reservation?';
                if (!window.confirm(msg)) return;
                await onDelete(id);
              }}
              onDeleteDay={async (id) => {
                await onDeleteDay(id);
              }}
            />
          )) : <p>{(translations as any).noPreReservations || 'No pre-reservations'}</p>}
        </section>
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
                <table style={{ width:'100%', fontSize:'0.8rem', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign:'left' }}>{(translations as any).time || 'Time'}</th>
                      <th style={{ textAlign:'left' }}>{(translations as any).user || 'User'}</th>
                      <th style={{ textAlign:'left' }}>{(translations as any).event || 'Event'}</th>
                      <th style={{ textAlign:'left' }}>{(translations as any).action || 'Action'}</th>
                      <th style={{ textAlign:'left' }}>{(translations as any).from || 'From'}</th>
                      <th style={{ textAlign:'left' }}>{(translations as any).to || 'To'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyEvents.map((ev, idx) => (
                      <tr key={idx} style={ idx < historyEvents.length - 1 ? { borderBottom:'1px solid #eee' } : undefined }>
                        <td>{new Date(ev.timestamp).toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</td>
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
      </div>
    </div>
  );
};

export default DayPopup;
