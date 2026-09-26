import { describe, expect, it } from 'bun:test';
import { Money } from '@/domain/core/value-objects/money';
import {
  ExecutionItemAlreadyCompletedError,
  ExecutionItemNotFoundError,
  InvalidExecutionStatusError,
} from '../errors/execution-errors';
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

describe('ExecutionQueueItem.completeDiagnostic', () => {
  it('moves the service order to diagnosed with what the mechanic found', () => {
    const diagnosedAt = new Date('2026-09-17T16:30:00.000Z');
    const items = [anItem()];
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status: ExecutionStatus.IN_DIAGNOSTIC,
    });

    queueItem.completeDiagnostic(
      { items, notes: 'Correia com folga', diagnosedBy: 'mecanico-07' },
      diagnosedAt,
    );

    expect(queueItem.status).toBe(ExecutionStatus.DIAGNOSED);
    expect(queueItem.diagnosedItems).toBe(items);
    expect(queueItem.notes).toBe('Correia com folga');
    expect(queueItem.diagnosedBy).toBe('mecanico-07');
    expect(queueItem.diagnosedAt).toBe(diagnosedAt);
  });

  it.each([
    ExecutionStatus.QUEUED,
    ExecutionStatus.DIAGNOSED,
    ExecutionStatus.IN_EXECUTION,
    ExecutionStatus.ABORTED,
  ])('refuses to diagnose a service order that is %s', (status) => {
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status,
    });

    expect(() =>
      queueItem.completeDiagnostic({ items: [], diagnosedBy: 'mecanico-07' }),
    ).toThrow(InvalidExecutionStatusError);
    expect(queueItem.status).toBe(status);
  });
});

describe('ExecutionQueueItem.startExecution', () => {
  it('moves a diagnosed service order into execution with the approved items', () => {
    const startedAt = new Date('2026-09-17T17:00:00.000Z');
    const items = [anItem()];
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status: ExecutionStatus.DIAGNOSED,
    });

    queueItem.startExecution({ items }, startedAt);

    expect(queueItem.status).toBe(ExecutionStatus.IN_EXECUTION);
    expect(queueItem.executionItems).toBe(items);
    expect(queueItem.startedAt).toBe(startedAt);
  });

  it('starts the clock of every approved item', () => {
    const startedAt = new Date('2026-09-17T17:00:00.000Z');
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status: ExecutionStatus.DIAGNOSED,
    });

    queueItem.startExecution({ items: [anItem(), anItem()] }, startedAt);

    expect(queueItem.executionItems?.map((item) => item.startedAt)).toEqual([
      startedAt,
      startedAt,
    ]);
  });

  it.each([
    ExecutionStatus.QUEUED,
    ExecutionStatus.IN_DIAGNOSTIC,
    ExecutionStatus.IN_EXECUTION,
    ExecutionStatus.COMPLETED,
    ExecutionStatus.FAILED,
    ExecutionStatus.ABORTED,
  ])('refuses to start executing a service order that is %s', (status) => {
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status,
    });

    expect(() => queueItem.startExecution({ items: [anItem()] })).toThrow(
      InvalidExecutionStatusError,
    );
    expect(queueItem.status).toBe(status);
    expect(queueItem.executionItems).toBeUndefined();
  });
});

describe('ExecutionQueueItem.completeItems', () => {
  const startedAt = new Date('2026-09-17T14:30:00.000Z');
  const finishedAt = new Date('2026-09-17T16:00:00.000Z');

  const inExecution = () =>
    new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status: ExecutionStatus.IN_EXECUTION,
      startedAt,
      executionItems: [
        new ExecutionItem({
          kind: ExecutionItemKind.SERVICE,
          referenceId: 'service-1',
          startedAt,
        }),
        new ExecutionItem({
          kind: ExecutionItemKind.SERVICE,
          referenceId: 'service-2',
          startedAt,
        }),
        new ExecutionItem({
          kind: ExecutionItemKind.AUTO_PART,
          referenceId: 'auto-part-1',
          startedAt,
        }),
      ],
    });

  it('completes a service and keeps the execution going while others remain', () => {
    const queueItem = inExecution();

    queueItem.completeItems({ serviceIds: ['service-1'] }, finishedAt);

    expect(queueItem.status).toBe(ExecutionStatus.IN_EXECUTION);
    expect(queueItem.completedAt).toBeUndefined();
    expect(queueItem.services.map((item) => item.isCompleted)).toEqual([
      true,
      false,
    ]);
    expect(queueItem.services[0]?.executionTimeMs).toBe(5400000);
  });

  it('completes the execution when the last service is done', () => {
    const queueItem = inExecution();

    queueItem.completeItems({ serviceIds: ['service-1'] }, startedAt);
    queueItem.completeItems({ serviceIds: ['service-2'] }, finishedAt);

    expect(queueItem.status).toBe(ExecutionStatus.COMPLETED);
    expect(queueItem.completedAt).toBe(finishedAt);
    expect(queueItem.isFinished).toBe(true);
  });

  it('gives the auto parts as applied when the execution completes', () => {
    const queueItem = inExecution();

    queueItem.completeItems(
      { serviceIds: ['service-1', 'service-2'] },
      finishedAt,
    );

    const autoPart = queueItem.executionItems?.find(
      (item) => item.kind === ExecutionItemKind.AUTO_PART,
    );

    expect(autoPart?.isCompleted).toBe(true);
    expect(autoPart?.finishedAt).toBe(finishedAt);
  });

  it('only lists services as the items the mechanic completes', () => {
    expect(inExecution().services.map((item) => item.referenceId)).toEqual([
      'service-1',
      'service-2',
    ]);
  });

  it('has no services before the execution starts', () => {
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
    });

    expect(queueItem.services).toEqual([]);
  });

  it('refuses a service that is not part of the execution, without completing any', () => {
    const queueItem = inExecution();

    expect(() =>
      queueItem.completeItems({ serviceIds: ['service-1', 'unknown'] }),
    ).toThrow(ExecutionItemNotFoundError);
    expect(queueItem.services.some((item) => item.isCompleted)).toBe(false);
  });

  it('refuses an auto part as if it were a service', () => {
    expect(() =>
      inExecution().completeItems({ serviceIds: ['auto-part-1'] }),
    ).toThrow(ExecutionItemNotFoundError);
  });

  it.each([
    ExecutionStatus.QUEUED,
    ExecutionStatus.IN_DIAGNOSTIC,
    ExecutionStatus.DIAGNOSED,
    ExecutionStatus.COMPLETED,
    ExecutionStatus.FAILED,
    ExecutionStatus.ABORTED,
  ])('refuses to complete items of a service order that is %s', (status) => {
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status,
    });

    expect(() =>
      queueItem.completeItems({ serviceIds: ['service-1'] }),
    ).toThrow(InvalidExecutionStatusError);
    expect(queueItem.status).toBe(status);
  });
});

describe('ExecutionQueueItem.failDiagnostic', () => {
  it('moves a service order in diagnostic to failed with the reason', () => {
    const failedAt = new Date('2026-09-17T16:30:00.000Z');
    const queueItem = new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status: ExecutionStatus.IN_DIAGNOSTIC,
    });

    queueItem.failDiagnostic(
      { reason: 'UNREPAIRABLE', detail: 'Bloco do motor trincado' },
      failedAt,
    );

    expect(queueItem.status).toBe(ExecutionStatus.FAILED);
    expect(queueItem.failureReason).toBe('UNREPAIRABLE');
    expect(queueItem.failureDetail).toBe('Bloco do motor trincado');
    expect(queueItem.failedAt).toBe(failedAt);
    expect(queueItem.isFinished).toBe(true);
  });

  it.each([
    ExecutionStatus.QUEUED,
    ExecutionStatus.DIAGNOSED,
    ExecutionStatus.IN_EXECUTION,
    ExecutionStatus.FAILED,
    ExecutionStatus.ABORTED,
  ])(
    'refuses to fail the diagnostic of a service order that is %s',
    (status) => {
      const queueItem = new ExecutionQueueItem({
        serviceOrderId: 'order-1',
        vehicle,
        status,
      });

      expect(() =>
        queueItem.failDiagnostic({ reason: 'UNREPAIRABLE' }),
      ).toThrow(InvalidExecutionStatusError);
      expect(queueItem.status).toBe(status);
    },
  );
});

describe('ExecutionQueueItem.failExecution', () => {
  const failedAt = new Date('2026-09-17T17:30:00.000Z');

  const inExecution = () =>
    new ExecutionQueueItem({
      serviceOrderId: 'order-1',
      vehicle,
      status: ExecutionStatus.IN_EXECUTION,
      executionItems: [
        new ExecutionItem({
          kind: ExecutionItemKind.SERVICE,
          referenceId: 'service-1',
          isCompleted: true,
        }),
        new ExecutionItem({
          kind: ExecutionItemKind.SERVICE,
          referenceId: 'service-2',
        }),
        new ExecutionItem({
          kind: ExecutionItemKind.SERVICE,
          referenceId: 'service-3',
        }),
        new ExecutionItem({
          kind: ExecutionItemKind.AUTO_PART,
          referenceId: 'auto-part-1',
        }),
      ],
    });

  it('moves a service order in execution to failed with the reason', () => {
    const queueItem = inExecution();

    queueItem.failExecution(
      {
        reason: 'PART_UNAVAILABLE',
        detail: 'Correia dentada sem estoque no fornecedor',
      },
      failedAt,
    );

    expect(queueItem.status).toBe(ExecutionStatus.FAILED);
    expect(queueItem.failureReason).toBe('PART_UNAVAILABLE');
    expect(queueItem.failureDetail).toBe(
      'Correia dentada sem estoque no fornecedor',
    );
    expect(queueItem.failedAt).toBe(failedAt);
  });

  it('gives every pending service as failed when none is named', () => {
    const queueItem = inExecution();

    queueItem.failExecution({ reason: 'PART_UNAVAILABLE' }, failedAt);

    expect(queueItem.failedServices.map((item) => item.referenceId)).toEqual([
      'service-2',
      'service-3',
    ]);
  });

  it('fails only the services the mechanic named', () => {
    const queueItem = inExecution();

    queueItem.failExecution(
      { reason: 'PART_UNAVAILABLE', serviceIds: ['service-3'] },
      failedAt,
    );

    expect(queueItem.failedServices.map((item) => item.referenceId)).toEqual([
      'service-3',
    ]);
    expect(queueItem.failedServices[0]?.failedAt).toBe(failedAt);
  });

  it('refuses a service that is not part of the execution, without failing', () => {
    const queueItem = inExecution();

    expect(() =>
      queueItem.failExecution({
        reason: 'PART_UNAVAILABLE',
        serviceIds: ['unknown'],
      }),
    ).toThrow(ExecutionItemNotFoundError);
    expect(queueItem.status).toBe(ExecutionStatus.IN_EXECUTION);
  });

  it('refuses a service that was already completed', () => {
    const queueItem = inExecution();

    expect(() =>
      queueItem.failExecution({
        reason: 'PART_UNAVAILABLE',
        serviceIds: ['service-1'],
      }),
    ).toThrow(ExecutionItemAlreadyCompletedError);
    expect(queueItem.status).toBe(ExecutionStatus.IN_EXECUTION);
  });

  it.each([
    ExecutionStatus.QUEUED,
    ExecutionStatus.IN_DIAGNOSTIC,
    ExecutionStatus.DIAGNOSED,
    ExecutionStatus.COMPLETED,
    ExecutionStatus.FAILED,
    ExecutionStatus.ABORTED,
  ])(
    'refuses to fail the execution of a service order that is %s',
    (status) => {
      const queueItem = new ExecutionQueueItem({
        serviceOrderId: 'order-1',
        vehicle,
        status,
      });

      expect(() =>
        queueItem.failExecution({ reason: 'PART_UNAVAILABLE' }),
      ).toThrow(InvalidExecutionStatusError);
      expect(queueItem.status).toBe(status);
    },
  );
});

describe('ExecutionQueueItem.abort', () => {
  it.each([
    ExecutionStatus.QUEUED,
    ExecutionStatus.IN_DIAGNOSTIC,
    ExecutionStatus.DIAGNOSED,
    ExecutionStatus.IN_EXECUTION,
    ExecutionStatus.FAILED,
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

  it.each([ExecutionStatus.COMPLETED, ExecutionStatus.ABORTED])(
    'refuses to abort a service order that is already %s',
    (status) => {
      const queueItem = new ExecutionQueueItem({
        serviceOrderId: 'order-1',
        vehicle,
        status,
      });

      expect(() => queueItem.abort({ reason: 'TIMEOUT' })).toThrow(
        InvalidExecutionStatusError,
      );
      expect(queueItem.status).toBe(status);
    },
  );
});
