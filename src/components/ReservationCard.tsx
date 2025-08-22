import React from 'react';
import { ReservationListItem } from '../services/reservations';

export interface NotesStateEntry { open: boolean; draft: string; baseline: string; saving: boolean }

interface BaseProps {
  res: ReservationListItem;
  role: 'admin' | 'staff' | null | undefined;
  username: string | null | undefined;
  translations: any;
  notesState: Record<string, NotesStateEntry>;
  toggleNotes(res: ReservationListItem): void;
  updateDraft(id: string, val: string): void;
  resetDraft(id: string): void;
  saveNotes(res: ReservationListItem): void;
  navigateTo(id: string): void;
}

interface ReservationCardProps extends BaseProps {
  variant: 'primary' | 'pre';
  anyConfirmed?: boolean; // for pre variant
  onStatusChange?(id: string, next: 'pre' | 'confirmed' | 'flagged'): Promise<void>;
  onFlagToggle?(id: string, next: boolean): Promise<void>;
  onDelete?(id: string): Promise<void>;
  onDeleteDay?(id: string): Promise<void>;
  showDeleteChoices?: boolean;
  startDeleteChoices?(): void;
  cancelDeleteChoices?(): void;
  canDelete?: boolean;
  multiDay?: boolean;
  targetDayKey?: string | null;
}

const ReservationCard: React.FC<ReservationCardProps> = (props) => {
  const { res, role, username, translations, notesState, toggleNotes, updateDraft, resetDraft, saveNotes, navigateTo, variant } = props;

  const canEdit = role === 'admin' || (role === 'staff' && username && res.author && username.toLowerCase() === res.author.toLowerCase());
  const state = notesState[res._id || ''];
  const baseValue = (!res.reservationStatus || res.reservationStatus === 'pre') ? 'pre' : 'confirmed';

  const renderNotes = () => {
    if (!state?.open && (res as any).notes) {
      return <div style={{ marginTop:4, fontSize:'0.65rem', whiteSpace:'pre-wrap', background:'#f9f9f9', border:'1px solid #eee', padding:4, borderRadius:4 }}>{(res as any).notes}</div>;
    }
    if (state?.open) {
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
    }
    return null;
  };

  const statusSelect = (
    <select
      value={baseValue}
      disabled={variant === 'pre' && baseValue === 'pre' && props.anyConfirmed}
      onChange={async (e) => {
        if (!props.onStatusChange || !res._id) return;
        const base = e.target.value as 'pre' | 'confirmed';
        const next = base === 'pre' ? 'pre' : (res.reservationStatus === 'flagged' ? 'flagged' : 'confirmed');
        await props.onStatusChange(res._id, next);
      }}
    >
      <option value="pre">Pre-reservation</option>
      <option value="confirmed" disabled={variant === 'pre' && props.anyConfirmed}>Reservation</option>
    </select>
  );

  const flagToggle = (res.reservationStatus && res.reservationStatus !== 'pre' && props.onFlagToggle) ? (
    <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
      <input
        type="checkbox"
        checked={res.reservationStatus === 'flagged'}
        onChange={async (e) => {
          if (!res._id) return;
            await props.onFlagToggle!(res._id, e.target.checked);
        }}
      />
      <span>{(translations as any).flaggedPaid || 'Flagged (paid)'}</span>
    </label>
  ) : null;

  const deleteButtons = () => {
    if (variant !== 'pre' || !props.canDelete) return null;
    if (props.showDeleteChoices) {
      return (
        <span style={{ display:'inline-flex', gap:4, flexWrap:'wrap' }}>
          {props.multiDay && props.onDeleteDay && props.targetDayKey && (
            <button
              style={{ padding:'4px 8px', fontSize:'0.65rem', background:'#b36b00', color:'#fff' }}
              onClick={() => props.onDeleteDay && res._id && props.onDeleteDay(res._id)}
            >{(translations as any).removeThisDay || 'Remove this day'}</button>
          )}
          <button
            style={{ padding:'4px 8px', fontSize:'0.65rem', background:'#c62828', color:'#fff' }}
            onClick={() => res._id && props.onDelete && props.onDelete(res._id!)}
          >{(translations as any).removeAllDays || 'Remove all days'}</button>
          <button
            style={{ padding:'4px 8px', fontSize:'0.65rem' }}
            onClick={() => props.cancelDeleteChoices && props.cancelDeleteChoices()}
          >{(translations as any).cancel || 'Cancel'}</button>
        </span>
      );
    }
    return (
      <button
        style={{ padding:'4px 8px', fontSize:'0.7rem', background:'#c62828', color:'#fff' }}
        onClick={() => {
          if (props.multiDay) {
            props.startDeleteChoices && props.startDeleteChoices();
          } else {
            // Single-day: go straight to confirmation for full delete
            if (res._id && props.onDelete) {
              // Outer DayPopup onDelete already performs confirmation
              props.onDelete(res._id);
            }
          }
        }}
      >{(translations as any).remove || 'Remove'}</button>
    );
  };

  return (
    <div className={`reservation ${variant === 'pre' ? 'pre-reservation' : ''}`} style={variant === 'pre' ? { borderBottom:'1px solid #ddd', paddingBottom:8, marginBottom:8 } : undefined}>
      <p>{res.event}</p>
      {res.author ? <p>{res.author}</p> : null}
      <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:8, marginTop:4 }}>
        <label style={{ marginRight:'6px' }}>{(translations as any).status || 'Status'}:</label>
        {statusSelect}
        {flagToggle}
      </div>
      <div style={{ marginTop:8, display:'flex', flexDirection:'row', gap:6, flexWrap:'wrap' }}>
        <button
          style={{ padding:'4px 8px', fontSize:'0.7rem', opacity: canEdit ? 1 : 0.6 }}
          disabled={!canEdit}
          onClick={() => canEdit && toggleNotes(res)}
          title={state?.open ? ((translations as any).closeNotesEditor || 'Close Notes') : ((translations as any).editNotes || 'Edit Notes')}
        >{state?.open ? ((translations as any).closeNotesEditor || 'Close Notes') : ((translations as any).editNotes || 'Edit Notes')}</button>
        <button style={{ padding:'4px 8px', fontSize:'0.75rem' }} onClick={() => res._id && navigateTo(res._id)}>{(translations as any).view || 'View'}</button>
        {deleteButtons()}
      </div>
      {renderNotes()}
    </div>
  );
};

export default ReservationCard;
