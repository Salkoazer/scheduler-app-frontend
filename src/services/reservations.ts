import axios from 'axios';
import { csrfHeader, ensureCsrfToken } from './csrf';
import { getApiBase } from './apiBase';

// Payload used when creating a reservation (client-side)
interface Reservation {
    room: string;
    nif: string;
    producerName: string;
    email: string;
    contact: string;
    responsablePerson: string;
    event: string;
    eventClassification: string;
    dates: Date[]; // list of individual day start timestamps (00:00 UTC)
    type: string;
    notes?: string;
    reservationStatus?: 'pre' | 'confirmed' | 'flagged';
}

// Shape returned by GET /reservations (server projection)
export interface ReservationListItem {
    _id?: string;
    dates: string[]; // server always returns dates[]
    room: string;
    event: string;
    eventClassification?: string;
    type: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    author?: string;
    reservationStatus?: 'pre' | 'confirmed' | 'flagged';
    nif?: string;
    producerName?: string;
    email?: string;
    contact?: string;
    responsablePerson?: string;
    notes?: string;
    adminNotes?: string;
}

// Central API base (absolute) used for axios & fetch calls
const API_BASE = getApiBase();
if (process.env.NODE_ENV !== 'production') {
    // Lightweight one-time log
    // eslint-disable-next-line no-console
    console.log('[reservations] API base =', API_BASE);
}

// Dedicated axios instance with consistent base & credentials
const http = axios.create({
    baseURL: API_BASE.endsWith('/api') ? API_BASE : API_BASE + '/api',
    withCredentials: true
});

export const createReservation = async (reservation: Reservation): Promise<boolean> => {
    try {
        await ensureCsrfToken();
    const response = await http.post(`/reservations`, reservation, { headers: await csrfHeader() });
        return response.status === 201;
    } catch (error) {
        console.error('Failed to create reservation:', error);
        throw error;
    }
};

// In-flight request de-duplication + tiny TTL cache to reduce backend load and avoid 429s when multiple effects trigger the same range fetch.
const inFlightFetches = new Map<string, Promise<ReservationListItem[]>>();
const recentCache = new Map<string, { expires: number; data: ReservationListItem[] }>();
// Expose a way to clear caches when user identity changes (prevents leaking previous user's view after logout/login swap)
export function clearReservationCache() {
    if (process.env.NODE_ENV !== 'production') console.log('[fetchReservations cache cleared]');
    inFlightFetches.clear();
    recentCache.clear();
}
const DEFAULT_CACHE_TTL_MS = 30_000; // 30s reuse window

export const fetchReservations = async (start: string, end: string, opts?: { noCache?: boolean }): Promise<ReservationListItem[]> => {
    const key = `${start}|${end}`;
    const now = Date.now();
    const cached = recentCache.get(key);
    if (!opts?.noCache && cached && cached.expires > now) {
        if (process.env.NODE_ENV !== 'production') console.log('[fetchReservations cache hit]', key);
        return cached.data;
    }
    const existing = !opts?.noCache && inFlightFetches.get(key);
    if (existing) {
        if (process.env.NODE_ENV !== 'production') console.log('[fetchReservations dedup join]', key);
        return existing;
    }
    if (process.env.NODE_ENV !== 'production') console.log('[fetchReservations start]', key);
    const exec = (async () => {
        const maxAttempts = 3;
        let attempt = 0;
        while (true) {
            attempt++;
            try {
                const response = await http.get(`/reservations`, { params: { start, end } });
                const data = response.data as ReservationListItem[];
                if (!opts?.noCache) {
                    recentCache.set(key, { expires: Date.now() + DEFAULT_CACHE_TTL_MS, data });
                }
                return data;
            } catch (error: any) {
                const status = error?.response?.status;
                if (status === 429 && attempt < maxAttempts) {
                    // Exponential backoff with jitter
                    const base = 500; // 0.5s
                    const delay = base * Math.pow(2, attempt - 1) + Math.random() * 200;
                    if (process.env.NODE_ENV !== 'production') console.warn(`[fetchReservations 429 retry ${attempt}] delaying ${Math.round(delay)}ms for`, key);
                    await new Promise(res => setTimeout(res, delay));
                    continue;
                }
                if (process.env.NODE_ENV !== 'production') console.error('[fetchReservations failed]', key, error);
                throw error;
            }
        }
    })();
    inFlightFetches.set(key, exec);
    try {
        return await exec;
    } finally {
        inFlightFetches.delete(key);
    }
};

export const updateReservationStatus = async (
    id: string,
    reservationStatus: 'pre' | 'confirmed' | 'flagged'
): Promise<boolean> => {
    try {
        await ensureCsrfToken();
    const res = await http.put(`/reservations/${id}/status`, { reservationStatus }, { headers: await csrfHeader() });
        return res.status === 200;
    } catch (e) {
        console.error('Failed to update reservation status:', e);
        throw e;
    }
};

export interface ReservationHistoryEvent {
    reservationId?: string;
    room: string;
    date: string;
    user?: string;
    action: string;
    event?: string;
    fromStatus?: 'pre' | 'confirmed' | 'flagged';
    toStatus?: 'pre' | 'confirmed' | 'flagged';
    timestamp: string;
}

export const fetchReservationHistory = async (date: string, room: string): Promise<ReservationHistoryEvent[]> => {
    try {
    const res = await http.get(`/reservations/history`, { params: { date, room } });
        return res.data as ReservationHistoryEvent[];
    } catch (e) {
        console.error('Failed to fetch reservation history:', e);
        throw e;
    }
};

// Full reservation document returned by GET /reservations/:id
export interface ReservationDetail extends ReservationListItem {
    room: string;
    nif: string;
    producerName: string;
    email: string;
    contact: string;
    responsablePerson: string;
    eventClassification: string;
    notes?: string;
    adminNotes?: string;
    reservationStatus?: 'pre' | 'confirmed' | 'flagged';
}

export const fetchReservation = async (id: string): Promise<ReservationDetail> => {
    try {
    const res = await http.get(`/reservations/${id}`);
        return res.data as ReservationDetail;
    } catch (e) {
    console.error('Failed to fetch reservation detail:', e, 'Base URL:', API_BASE, 'ID:', id);
        throw e;
    }
};

export async function updateReservationNotes(id: string, payload: { notes?: string; adminNotes?: string }) {
    await ensureCsrfToken();
    const headers: any = {
        'Content-Type': 'application/json',
        ...(await csrfHeader())
    };
    const res = await fetch(`${API_BASE}/api/reservations/${id}/notes`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed updating notes');
    return res.json();
}

export async function deleteReservation(id: string) {
    await ensureCsrfToken();
    const headers: any = { ...(await csrfHeader()) };
    const res = await fetch(`${API_BASE}/api/reservations/${id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed deleting reservation');
    return res.json();
}

export async function updateReservation(id: string, payload: Partial<{
    room: string; date: string; endDate: string; dates: string[]; nif: string; producerName: string; email: string; contact: string; responsablePerson: string; event: string; eventClassification: string; type: string; notes: string;
}>) {
    await ensureCsrfToken();
    const headers: any = { 'Content-Type':'application/json', ...(await csrfHeader()) };
    const res = await fetch(`${API_BASE}/api/reservations/${id}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed updating reservation');
    return res.json();
}

// Day-clear events (server-driven notifications)
export interface DayClearEvent {
    id: string;
    room: string;
    dayKey: string;
    createdAt: string;
    cause?: any;
}

export async function fetchDayClearEvents(since?: string): Promise<DayClearEvent[]> {
    const params: any = {};
    if (since) params.since = since;
    const res = await fetch(`${API_BASE}/api/day-clear-events` + (Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''), {
        credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed fetching events');
    return res.json();
}

export async function consumeDayClearEvent(id: string) {
    await ensureCsrfToken();
    const hdr: any = await csrfHeader();
    const res = await fetch(`${API_BASE}/api/day-clear-events/${id}/consume`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...hdr }
    });
    if (!res.ok) throw new Error('Failed consuming event');
    return res.json();
}

export async function consumeDayClearEvents(ids: string[]) {
    if (!ids.length) return;
    await ensureCsrfToken();
    const hdr: any = await csrfHeader();
    const res = await fetch(`${API_BASE}/api/day-clear-events/consume`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...hdr },
        body: JSON.stringify({ ids })
    });
    if (!res.ok) throw new Error('Failed batch consuming events');
    return res.json();
}
