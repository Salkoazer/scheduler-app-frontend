import axios from 'axios';

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
    isActive: boolean;
    author: string;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

export const createReservation = async (reservation: Reservation): Promise<boolean> => {
    try {
        const token = localStorage.getItem('token'); // Retrieve the token from local storage
        const response = await axios.post(`${API_URL}/reservations`, reservation, {
            headers: {
                'Authorization': `Bearer ${token}` // Include the token in the request headers
            }
        });
        return response.status === 201;
    } catch (error) {
        console.error('Failed to create reservation:', error);
        throw error;
    }
};

export const fetchReservations = async (start: string, end: string): Promise<Reservation[]> => {
    console.log(`Fetching reservations from ${start} to ${end}`);
    try {
        const token = localStorage.getItem('token'); // Retrieve the token from local storage
        const response = await axios.get(`${API_URL}/reservations`, {
            headers: {
                'Authorization': `Bearer ${token}` // Include the token in the request headers
            },
            params: {
                start,
                end
            }
        });
        return response.data;
    } catch (error) {
        console.error('Failed to fetch reservations:', error);
        throw error;
    }
};
