import z from 'zod';

export const executionParamsSchema = z.object({
  serviceOrderId: z.uuid(),
});

export const completeExecutionItemsBodySchema = z.object({
  services: z.array(z.object({ serviceId: z.uuid() })).min(1),
});

export const executionResponseSchema = z.object({
  serviceOrderId: z.uuid(),
  status: z.string(),
  completedAt: z.iso.datetime().optional(),
  services: z.array(
    z.object({
      serviceId: z.string(),
      isCompleted: z.boolean(),
      finishedAt: z.iso.datetime().optional(),
      executionTimeMs: z.number().int().optional(),
    }),
  ),
});
