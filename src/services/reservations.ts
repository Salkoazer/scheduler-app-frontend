import axios from 'axios';
import { csrfHeader, ensureCsrfToken } from './csrf';

// Payload used when creating a reservation (client-side)
interface Reservation {
    room: string;
    reservationNumber: string;
    nif: string;
    producerName: string;
    email: string;
    contact: string;
    responsablePerson: string;
    event: string;
    eventClassification: string;
    date: Date;
    type: string;
    notes?: string;
}

// Shape returned by GET /reservations (server projection)
export interface ReservationListItem {
    _id?: string;
    date: string;
    room: string;
    event: string;
    type: string;
    status?: string;
    createdAt?: string;
    author?: string;
}

const API_URL = (() => {
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        console.log('Reservations API URL (dev): /api');
        return '/api';
    }
    return process.env.REACT_APP_API_URL || '/api';
})();

export const createReservation = async (reservation: Reservation): Promise<boolean> => {
    try {
        await ensureCsrfToken();
        const response = await axios.post(`${API_URL}/reservations`, reservation, {
            withCredentials: true,
            headers: await csrfHeader()
        });
        return response.status === 201;
    } catch (error) {
        console.error('Failed to create reservation:', error);
        throw error;
    }
};

export const fetchReservations = async (start: string, end: string): Promise<ReservationListItem[]> => {
    console.log(`Fetching reservations from ${start} to ${end}`);
    try {
        const response = await axios.get(`${API_URL}/reservations`, {
            withCredentials: true,
            params: { start, end }
        });
    return response.data as ReservationListItem[];
    } catch (error) {
        console.error('Failed to fetch reservations:', error);
        throw error;
    }
};
