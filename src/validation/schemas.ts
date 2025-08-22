import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const dateEntrySchema = z.object({
  date: z.date({ required_error: 'Date is required' }),
  type: z.enum(['event', 'assembly', 'disassembly', 'others'], {
    required_error: 'Type is required',
  }),
  notes: z.string().optional(),
});

// Relaxed validation: only event is mandatory; other fields optional with no specific formatting
export const reservationBaseSchema = z.object({
  room: z.string().min(1, 'Room is required'),
  nif: z.string().optional(),
  producerName: z.string().optional(),
  email: z.string().optional(),
  contact: z.string().optional(),
  responsablePerson: z.string().optional(),
  event: z.string().min(1, 'Event is required'),
  eventClassification: z.string().optional(),
});

export const reservationPayloadSchema = reservationBaseSchema.extend({
  date: z.date({ required_error: 'Date is required' }),
  type: z.string().optional(),
  notes: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ReservationBase = z.infer<typeof reservationBaseSchema>;
export type ReservationPayload = z.infer<typeof reservationPayloadSchema>;
