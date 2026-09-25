import z from 'zod';

const serviceSchema = z.object({
  serviceId: z.uuid(),
  description: z.string().optional(),
});

const autoPartSchema = z.object({
  autoPartId: z.uuid(),
  description: z.string().optional(),
  quantity: z.int().positive(),
});

export const startExecutionSchema = z.object({
  serviceOrderId: z.uuid(),
  items: z.object({
    services: z.array(serviceSchema).default([]),
    autoParts: z.array(autoPartSchema).default([]),
  }),
});

export type StartExecutionPayload = z.infer<typeof startExecutionSchema>;
