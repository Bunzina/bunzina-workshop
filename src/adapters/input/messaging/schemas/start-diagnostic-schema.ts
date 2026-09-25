import z from 'zod';

const serviceSchema = z.object({
  serviceId: z.uuid(),
  description: z.string().optional(),
  priceCents: z.int().nonnegative(),
});

const autoPartSchema = z.object({
  autoPartId: z.uuid(),
  description: z.string().optional(),
  quantity: z.int().positive(),
  unitPriceCents: z.int().nonnegative(),
});

export const pricedItemsSchema = z.object({
  services: z.array(serviceSchema).default([]),
  autoParts: z.array(autoPartSchema).default([]),
});

export const startDiagnosticSchema = z.object({
  serviceOrderId: z.uuid(),
  vehicle: z.object({
    id: z.uuid(),
    plate: z.string().min(1),
    model: z.string().optional(),
  }),
  requestedItems: pricedItemsSchema,
  currency: z.string().min(1).default('BRL'),
});

export type StartDiagnosticPayload = z.infer<typeof startDiagnosticSchema>;
