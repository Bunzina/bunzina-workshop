import { describe, expect, it } from 'bun:test';
import { Money } from '@/domain/core/value-objects/money';
import { ExecutionItemKind } from '@/domain/execution/types/execution-item-kind';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import { makeExecutionItem } from '@/test/factories/make-execution-item';
import { makeExecutionLog } from '@/test/factories/make-execution-log';
import { makeExecutionQueueItem } from '@/test/factories/make-execution-queue-item';
import { ExecutionLogMapper, ExecutionQueueMapper } from './execution-mapper';

describe('ExecutionQueueMapper.toDatabase', () => {
  it('converts the aggregate into a document', () => {
    const queueItem = makeExecutionQueueItem();

    const document = ExecutionQueueMapper.toDatabase(queueItem);

    expect(document).toEqual({
      id: 'queue-item-id',
      serviceOrderId: 'service-order-id',
      vehicle: { id: 'vehicle-id', plate: 'ABC1D23', model: 'Gol 1.6' },
      status: ExecutionStatus.IN_DIAGNOSTIC,
      currency: 'BRL',
      requestedItems: [
        {
          id: 'item-id',
          kind: ExecutionItemKind.SERVICE,
          referenceId: 'service-id',
          description: 'Troca de correia',
          quantity: 1,
          unitPriceCents: 38000,
          totalPriceCents: 38000,
          isCompleted: false,
        },
      ],
      enqueuedAt: new Date('2026-09-17T16:00:00.000Z'),
      updatedAt: new Date('2026-09-17T16:00:00.000Z'),
    });
  });

  it('writes the diagnosed items when the mechanic already answered', () => {
    const queueItem = makeExecutionQueueItem({
      status: ExecutionStatus.DIAGNOSED,
      diagnosedItems: [makeExecutionItem({ id: 'diagnosed-item-id' })],
      diagnosedBy: 'mecanico-07',
      diagnosedAt: new Date('2026-09-17T16:30:00.000Z'),
      notes: 'Correia com folga',
    });

    const document = ExecutionQueueMapper.toDatabase(queueItem);

    expect(document.diagnosedItems?.[0]?.id).toBe('diagnosed-item-id');
    expect(document.diagnosedBy).toBe('mecanico-07');
    expect(document.notes).toBe('Correia com folga');
    expect(document.diagnosedAt).toEqual(new Date('2026-09-17T16:30:00.000Z'));
  });

  it('writes the correlation id of the saga and the reason of an abort', () => {
    const queueItem = makeExecutionQueueItem({
      correlationId: 'correlation-id',
      status: ExecutionStatus.ABORTED,
      failureReason: 'TIMEOUT',
      failureDetail: 'Cliente não respondeu',
      abortedAt: new Date('2026-09-17T16:55:00.000Z'),
    });

    const document = ExecutionQueueMapper.toDatabase(queueItem);

    expect(document).toMatchObject({
      correlationId: 'correlation-id',
      failureReason: 'TIMEOUT',
      failureDetail: 'Cliente não respondeu',
      abortedAt: new Date('2026-09-17T16:55:00.000Z'),
    });
    expect(ExecutionQueueMapper.toDomain(document)).toEqual(queueItem);
  });

  it('writes an item without price as it came from the execution command', () => {
    const queueItem = makeExecutionQueueItem({
      requestedItems: [makeExecutionItem({ unitPrice: undefined })],
    });

    const document = ExecutionQueueMapper.toDatabase(queueItem);

    expect(document.requestedItems[0]?.unitPriceCents).toBeUndefined();
    expect(document.requestedItems[0]?.totalPriceCents).toBeUndefined();
  });
});

describe('ExecutionQueueMapper.toDomain', () => {
  it('rebuilds the aggregate without leaking the mongo _id', () => {
    const queueItem = makeExecutionQueueItem();
    const document = {
      _id: 'mongo-object-id',
      ...ExecutionQueueMapper.toDatabase(queueItem),
    };

    const rebuilt = ExecutionQueueMapper.toDomain(document);

    expect(rebuilt).toEqual(queueItem);
    expect(JSON.stringify(rebuilt)).not.toContain('mongo-object-id');
  });

  it('rebuilds the money of each item in the currency of the queue', () => {
    const document = ExecutionQueueMapper.toDatabase(
      makeExecutionQueueItem({
        currency: 'USD',
        requestedItems: [
          makeExecutionItem({ quantity: 3, unitPrice: new Money(4500, 'USD') }),
        ],
      }),
    );

    const rebuilt = ExecutionQueueMapper.toDomain(document);

    expect(rebuilt.requestedItems[0]?.unitPrice?.amountCents).toBe(4500);
    expect(rebuilt.requestedItems[0]?.unitPrice?.currency).toBe('USD');
    expect(rebuilt.requestedItems[0]?.totalPrice?.amountCents).toBe(13500);
  });

  it('rebuilds the diagnosed items of an already diagnosed queue item', () => {
    const document = ExecutionQueueMapper.toDatabase(
      makeExecutionQueueItem({
        status: ExecutionStatus.DIAGNOSED,
        diagnosedItems: [makeExecutionItem({ id: 'diagnosed-item-id' })],
      }),
    );

    const rebuilt = ExecutionQueueMapper.toDomain(document);

    expect(rebuilt.diagnosedItems?.[0]?.id).toBe('diagnosed-item-id');
    expect(rebuilt.diagnosedItems?.[0]?.unitPrice?.amountCents).toBe(38000);
  });

  it('rebuilds an item that has no price', () => {
    const document = ExecutionQueueMapper.toDatabase(
      makeExecutionQueueItem({
        requestedItems: [makeExecutionItem({ unitPrice: undefined })],
      }),
    );

    const rebuilt = ExecutionQueueMapper.toDomain(document);

    expect(rebuilt.requestedItems[0]?.unitPrice).toBeUndefined();
    expect(rebuilt.requestedItems[0]?.totalPrice).toBeUndefined();
  });
});

describe('ExecutionLogMapper', () => {
  it('converts the log into a document', () => {
    const document = ExecutionLogMapper.toDatabase(
      makeExecutionLog({ detail: 'Correia com folga' }),
    );

    expect(document).toEqual({
      id: 'log-id',
      serviceOrderId: 'service-order-id',
      event: 'diagnostic-started',
      status: ExecutionStatus.IN_DIAGNOSTIC,
      detail: 'Correia com folga',
      occurredAt: new Date('2026-09-17T16:00:00.000Z'),
    });
  });

  it('rebuilds the log without leaking the mongo _id', () => {
    const log = makeExecutionLog({ reason: 'TIMEOUT' });
    const document = {
      _id: 'mongo-object-id',
      ...ExecutionLogMapper.toDatabase(log),
    };

    const rebuilt = ExecutionLogMapper.toDomain(document);

    expect(rebuilt).toEqual(log);
    expect(JSON.stringify(rebuilt)).not.toContain('mongo-object-id');
  });
});
