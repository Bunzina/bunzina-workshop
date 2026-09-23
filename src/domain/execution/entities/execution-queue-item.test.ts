import { describe, expect, it } from 'bun:test';
import { Money } from '@/domain/core/value-objects/money';
import { InvalidExecutionStatusError } from '../errors/execution-errors';
import { ExecutionItemKind } from '../types/execution-item-kind';
import { ExecutionStatus } from '../types/execution-status';
import { Vehicle } from '../value-objects/vehicle';
import { ExecutionItem } from './execution-item';
import { ExecutionQueueItem } from './execution-queue-item';

const vehicle = new Vehicle({ id: 'vehicle-1', plate: 'ABC1D23' });

const anItem = () =>
  new ExecutionItem({
    kind: ExecutionItemKind.SERVICE,
    referenceId: 'service-1',
    unitPrice: new Money(38000),
  });

describe('ExecutionQueueItem', () => {
  it('keeps the service order it belongs to', () => {
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
    });

    expect(queueItem.serviceOrderId).toBe('order-1');
    expect(queueItem.vehicle).toBe(vehicle);
  });

  it('starts queued, in BRL and without items', () => {
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
    });

    expect(queueItem.status).toBe(ExecutionStatus.QUEUED);
    expect(queueItem.currency).toBe('BRL');
    expect(queueItem.requestedItems).toEqual([]);
    expect(queueItem.diagnosedItems).toBeUndefined();
  });

  it('stamps the moment it entered the queue', () => {
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
    });

    expect(queueItem.enqueuedAt).toBeDate();
    expect(queueItem.updatedAt).toBeDate();
  });

  it('keeps the status and the items it was rebuilt with', () => {
    const enqueuedAt = new Date('2026-09-17T16:00:00.000Z');
    const items = [anItem()];

    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status: ExecutionStatus.DIAGNOSED,
      requestedItems: items,
      diagnosedItems: items,
      diagnosedBy: 'mecanico-07',
      enqueuedAt,
    });

    expect(queueItem.status).toBe(ExecutionStatus.DIAGNOSED);
    expect(queueItem.diagnosedItems).toEqual(items);
    expect(queueItem.diagnosedBy).toBe('mecanico-07');
    expect(queueItem.enqueuedAt).toBe(enqueuedAt);
  });

  it('rejects a queue item without a service order', () => {
    expect(
      () => new ExecutionQueueItem({ serviceOrderId: ' ', vehicle }),
    ).toThrow('ExecutionQueueItem requires a serviceOrderId');
  });
});

describe('ExecutionQueueItem.abort', () => {
  it.each([
    ExecutionStatus.QUEUED,
    ExecutionStatus.IN_DIAGNOSTIC,
    ExecutionStatus.DIAGNOSED,
    ExecutionStatus.IN_EXECUTION,
  ])('aborts a service order that is %s', (status) => {
    const abortedAt = new Date('2026-09-17T16:55:00.000Z');
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status,
    });

    queueItem.abort({ reason: 'TIMEOUT', detail: 'Sem resposta' }, abortedAt);

    expect(queueItem.status).toBe(ExecutionStatus.ABORTED);
    expect(queueItem.failureReason).toBe('TIMEOUT');
    expect(queueItem.failureDetail).toBe('Sem resposta');
    expect(queueItem.abortedAt).toBe(abortedAt);
    expect(queueItem.isFinished).toBe(true);
  });

  it.each([
    ExecutionStatus.COMPLETED,
    ExecutionStatus.FAILED,
    ExecutionStatus.ABORTED,
  ])('refuses to abort a service order that is already %s', (status) => {
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status,
    });

    expect(() => queueItem.abort({ reason: 'TIMEOUT' })).toThrow(
      InvalidExecutionStatusError,
    );
    expect(queueItem.status).toBe(status);
  });
});
