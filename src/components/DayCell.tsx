import React from 'react';
import { ReservationListItem } from '../services/reservations';

interface DayCellProps {
  day: number;
  date: Date;
  cellKey: string;
  reservations: ReservationListItem[];
  selectedRoom: string;
  isPast: boolean;
  isToday: boolean;
  onClick(day: number): void;
}

const DayCell: React.FC<DayCellProps> = ({ day, date, cellKey, reservations, selectedRoom, isPast, isToday, onClick }) => {
  const dayReservations = reservations.filter(res => {
    const datesArr: string[] = Array.isArray((res as any).dates) ? (res as any).dates : [];
    return datesArr.some(d => d.slice(0, 10) === cellKey);
  });
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

  return (
    <div
      className={`calendar-day ${isPast ? 'past-date' : ''} ${isToday ? 'today' : ''} ${reservation ? 'reservation' : ''} ${roomClass} ${statusClass}`}
      onClick={() => onClick(day)}
    >
      <span className="day-number">{day}</span>
      {reservation?.reservationStatus === 'flagged' && <span className="flag-corner" aria-hidden></span>}
      {reservation && <div className="reservation-name">{reservation.event}</div>}
      <div className="room-indicators">
        {showR1 && <span className="room-dot r1" title="Room 1"></span>}
        {showR2 && <span className="room-dot r2" title="Room 2"></span>}
        {showR3 && <span className="room-dot r3" title="Room 3"></span>}
      </div>
    </div>
  );
};

export default DayCell;
