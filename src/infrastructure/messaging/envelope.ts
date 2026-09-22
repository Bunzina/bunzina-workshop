import {
  failureReasons,
  type FailureReason,
} from '@/domain/execution/types/failure-reason';
import { z } from 'zod';

export const envelopeSchema = z.object({
  eventId: z.uuid(),
  eventType: z.string().regex(/^(cmd|evt)\.[a-z]+\.[a-z0-9-]+$/),
  eventVersion: z.number().int().positive(),
  occurredAt: z.iso.datetime(),
  correlationId: z.uuid(),
  causationId: z.uuid().optional(),
  producer: z.string().min(1),
  traceparent: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});

export type Envelope<TData = Record<string, unknown>> = Omit<
  z.infer<typeof envelopeSchema>,
  'data'
> & { data: TData };

export const failureReasonSchema = z.enum(failureReasons);

export { failureReasons };
export type { FailureReason };

type BuildInput<TData> = {
  eventType: string;
  correlationId: string;
  data: TData;
  causationId?: string;
};

export const buildEnvelope = <TData extends Record<string, unknown>>({
  eventType,
  correlationId,
  data,
  causationId,
}: BuildInput<TData>): Envelope<TData> => ({
  eventId: Bun.randomUUIDv7(),
  eventType,
  eventVersion: 1,
  occurredAt: new Date().toISOString(),
  correlationId,
  ...(causationId ? { causationId } : {}),
  producer: process.env.OTEL_SERVICE_NAME || 'bunzina-workshop',
  data,
});

export const parseEnvelope = (raw: unknown): Envelope =>
  envelopeSchema.parse(raw) as Envelope;
