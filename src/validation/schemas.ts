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

const nifRegex = /^[0-9]{9}$/;

export const reservationBaseSchema = z.object({
  room: z.string().min(1, 'Room is required'),
  nif: z
    .string()
    .regex(nifRegex, 'NIF must be 9 digits'),
  producerName: z.string().min(1, 'Producer name is required'),
  email: z.string().email('Invalid email'),
  contact: z.string().min(1, 'Contact is required'),
  responsablePerson: z.string().min(1, 'Responsible person is required'),
  event: z.string().min(1, 'Event is required'),
  eventClassification: z.string().min(1, 'Classification is required'),
});

export const reservationPayloadSchema = reservationBaseSchema.extend({
  date: z.date({ required_error: 'Date is required' }),
  type: z.enum(['event', 'assembly', 'disassembly', 'others'], {
    required_error: 'Type is required',
  }),
  notes: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ReservationBase = z.infer<typeof reservationBaseSchema>;
export type ReservationPayload = z.infer<typeof reservationPayloadSchema>;
