import z from 'zod';
import { failureReasonSchema } from '@/infrastructure/messaging/envelope';

export const failDiagnosticBodySchema = z.object({
  reason: failureReasonSchema,
  detail: z.string().optional(),
});

export const failExecutionBodySchema = failDiagnosticBodySchema.extend({
  services: z.array(z.object({ serviceId: z.uuid() })).optional(),
});

export const failureResponseSchema = z.object({
  serviceOrderId: z.uuid(),
  status: z.string(),
  reason: z.string(),
  detail: z.string().optional(),
  failedAt: z.iso.datetime(),
});

export const executionFailureResponseSchema = failureResponseSchema.extend({
  failedItems: z.array(z.object({ serviceId: z.string() })),
});
