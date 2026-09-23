import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AbortExecutionInput } from '@/application/use-cases/execution/abort-execution';
import { buildEnvelope } from '@/infrastructure/messaging/envelope';
import { makeAbortHandler } from './abort-handler';

const serviceOrderId = crypto.randomUUID();

const envelopeFor = (data: Record<string, unknown>) =>
  buildEnvelope({
    eventType: 'cmd.workshop.abort',
    correlationId: crypto.randomUUID(),
    data,
  });

const makeExecute = () => mock(async (_input: AbortExecutionInput) => null);

describe('makeAbortHandler', () => {
  let useCase: { execute: ReturnType<typeof makeExecute> };
  let handle: ReturnType<typeof makeAbortHandler>;

  beforeEach(() => {
    useCase = { execute: makeExecute() };
    handle = makeAbortHandler(useCase);
  });

  it('hands the compensation to the use case, chained to the command', async () => {
    const envelope = envelopeFor({
      serviceOrderId,
      reason: 'TIMEOUT',
      detail: 'Cliente não respondeu',
    });

    await handle(envelope);

    expect(useCase.execute).toHaveBeenCalledWith({
      serviceOrderId,
      reason: 'TIMEOUT',
      detail: 'Cliente não respondeu',
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
    });
  });

  it('accepts a compensation without detail', async () => {
    await handle(envelopeFor({ serviceOrderId, reason: 'CUSTOMER_REQUEST' }));

    const [input] = useCase.execute.mock.calls[0] ?? [];

    expect(input?.detail).toBeUndefined();
  });

  it('refuses a reason outside the closed enum', async () => {
    await expect(
      handle(envelopeFor({ serviceOrderId, reason: 'porque sim' })),
    ).rejects.toThrow();
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('refuses a payload without a valid service order', async () => {
    await expect(
      handle(envelopeFor({ serviceOrderId: 'not-a-uuid', reason: 'TIMEOUT' })),
    ).rejects.toThrow();
  });
});
