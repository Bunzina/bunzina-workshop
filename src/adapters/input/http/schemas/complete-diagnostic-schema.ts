import z from 'zod';
import { pricedItemsSchema } from '@/adapters/input/messaging/schemas/start-diagnostic-schema';

export const diagnosticParamsSchema = z.object({
  serviceOrderId: z.uuid(),
});

export const completeDiagnosticBodySchema = z.object({
  diagnosedItems: pricedItemsSchema,
  diagnosedBy: z.string().trim().min(1),
  notes: z.string().optional(),
});

export const diagnosticResponseSchema = z.object({
  serviceOrderId: z.uuid(),
  status: z.string(),
  diagnosedAt: z.iso.datetime(),
});

export const errorResponseSchema = z.object({
  message: z.string(),
});
