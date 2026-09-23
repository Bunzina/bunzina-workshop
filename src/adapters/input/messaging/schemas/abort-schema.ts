import z from 'zod';
import { failureReasonSchema } from '@/infrastructure/messaging/envelope';

export const abortSchema = z.object({
  serviceOrderId: z.uuid(),
  reason: failureReasonSchema,
  detail: z.string().optional(),
});

export type AbortPayload = z.infer<typeof abortSchema>;
