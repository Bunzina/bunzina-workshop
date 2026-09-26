import { beforeEach, describe, expect, it } from 'bun:test';
import {
  ExecutionItemNotFoundError,
  ExecutionNotFoundError,
  InvalidExecutionStatusError,
} from '@/domain/execution/errors/execution-errors';
import { ExecutionItemKind } from '@/domain/execution/types/execution-item-kind';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import {
  makeEventPublisher,
  makeExecutionMetrics,
  makeLogRepository,
  makeQueueRepository,
} from '@/test/factories/make-execution-doubles';
import { makeExecutionItem } from '@/test/factories/make-execution-item';
import { makeExecutionQueueItem } from '@/test/factories/make-execution-queue-item';
import {
  type CompleteExecutionItemsInput,
  CompleteExecutionItemsUseCase,
} from './complete-execution-items';

const startedAt = new Date('2026-09-17T14:30:00.000Z');

const anInput = (
  override?: Partial<CompleteExecutionItemsInput>,
): CompleteExecutionItemsInput => ({
  serviceOrderId: 'service-order-id',
  serviceIds: ['service-1'],
  ...override,
});

const inExecution = (override?: { correlationId?: string }) =>
  makeExecutionQueueItem({
    status: ExecutionStatus.IN_EXECUTION,
    startedAt,
    executionItems: [
      makeExecutionItem({ id: 'item-1', referenceId: 'service-1', startedAt }),
      makeExecutionItem({ id: 'item-2', referenceId: 'service-2', startedAt }),
      makeExecutionItem({
        id: 'item-3',
        kind: ExecutionItemKind.AUTO_PART,
        referenceId: 'auto-part-1',
        startedAt,
      }),
    ],
    ...override,
  });

describe('CompleteExecutionItemsUseCase', () => {
  let queueRepository: ReturnType<typeof makeQueueRepository>;
  let logRepository: ReturnType<typeof makeLogRepository>;
  let eventPublisher: ReturnType<typeof makeEventPublisher>;
  let metrics: ReturnType<typeof makeExecutionMetrics>;
  let useCase: CompleteExecutionItemsUseCase;

  beforeEach(() => {
    queueRepository = makeQueueRepository();
    logRepository = makeLogRepository();
    eventPublisher = makeEventPublisher();
    metrics = makeExecutionMetrics();
    useCase = new CompleteExecutionItemsUseCase(
      queueRepository,
      logRepository,
      eventPublisher,
      metrics,
    );

    queueRepository.findByServiceOrderId.mockResolvedValue(
      inExecution({ correlationId: 'correlation-id' }),
    );
  });

  describe('completing an intermediate item', () => {
    it('saves the item as completed and keeps the execution going', async () => {
      const queueItem = await useCase.execute(anInput());

      expect(queueItem.status).toBe(ExecutionStatus.IN_EXECUTION);
      expect(queueItem.services[0]?.isCompleted).toBe(true);
      expect(queueRepository.update).toHaveBeenCalledWith(queueItem);
    });

    it('records the completed items in the history', async () => {
      await useCase.execute(anInput());

      expect(logRepository.append).toHaveBeenCalledTimes(1);

      const [log] = logRepository.append.mock.calls[0] ?? [];

      expect(log?.event).toBe('execution-items-completed');
      expect(log?.status).toBe(ExecutionStatus.IN_EXECUTION);
      expect(log?.metadata).toEqual({ serviceIds: ['service-1'] });
    });

    it('does not publish nor measure anything', async () => {
      await useCase.execute(anInput());

      expect(eventPublisher.publish).not.toHaveBeenCalled();
      expect(metrics.executionFinished).not.toHaveBeenCalled();
    });
  });

  describe('completing the last item', () => {
    const completeAll = () =>
      useCase.execute(anInput({ serviceIds: ['service-1', 'service-2'] }));

    it('completes the execution', async () => {
      const queueItem = await completeAll();

      expect(queueItem.status).toBe(ExecutionStatus.COMPLETED);
      expect(queueItem.completedAt).toBeDate();
      expect(queueRepository.update).toHaveBeenCalledWith(queueItem);
    });

    it('measures how long the execution took', async () => {
      const queueItem = await completeAll();

      expect(metrics.executionFinished).toHaveBeenCalledWith(queueItem);
    });

    it('records the completion in the history after the items', async () => {
      await completeAll();

      const events = logRepository.append.mock.calls.map(([log]) => log.event);

      expect(events).toEqual([
        'execution-items-completed',
        'execution-completed',
      ]);
    });

    it('publishes the completion in the shape of the contract', async () => {
      const queueItem = await completeAll();
      const completedAt = queueItem.completedAt?.toISOString();
      const executionTimeMs =
        (queueItem.completedAt?.getTime() ?? 0) - startedAt.getTime();

      expect(eventPublisher.publish).toHaveBeenCalledWith({
        eventType: 'evt.workshop.execution-completed',
        correlationId: 'correlation-id',
        data: {
          serviceOrderId: 'service-order-id',
          completedItems: [
            {
              serviceId: 'service-1',
              finishedAt: completedAt,
              executionTimeMs,
            },
            {
              serviceId: 'service-2',
              finishedAt: completedAt,
              executionTimeMs,
            },
          ],
          completedAt,
        },
      });
    });

    it('keeps when each service really finished', async () => {
      await useCase.execute(anInput({ serviceIds: ['service-1'] }));
      const [firstSave] = queueRepository.update.mock.calls[0] ?? [];
      const firstFinishedAt = firstSave?.services[0]?.finishedAt;

      queueRepository.findByServiceOrderId.mockResolvedValue(firstSave ?? null);
      await useCase.execute(anInput({ serviceIds: ['service-2'] }));

      const [event] = eventPublisher.publish.mock.calls[0] ?? [];
      const [first] = (event?.data.completedItems ?? []) as {
        finishedAt: string;
      }[];

      expect(first?.finishedAt).toBe(firstFinishedAt?.toISOString() ?? '');
    });

    it('falls back to the service order id when no correlation id was kept', async () => {
      queueRepository.findByServiceOrderId.mockResolvedValue(inExecution());

      await completeAll();

      const [event] = eventPublisher.publish.mock.calls[0] ?? [];

      expect(event?.correlationId).toBe('service-order-id');
    });
  });

  it('refuses a service order that is not in the queue', async () => {
    queueRepository.findByServiceOrderId.mockResolvedValue(null);

    await expect(useCase.execute(anInput())).rejects.toThrow(
      ExecutionNotFoundError,
    );
  });

  it('refuses a service that is not part of the execution', async () => {
    await expect(
      useCase.execute(anInput({ serviceIds: ['unknown'] })),
    ).rejects.toThrow(ExecutionItemNotFoundError);
    expect(queueRepository.update).not.toHaveBeenCalled();
  });

  it('refuses a service order that is not in execution', async () => {
    queueRepository.findByServiceOrderId.mockResolvedValue(
      makeExecutionQueueItem({ status: ExecutionStatus.ABORTED }),
    );

    await expect(useCase.execute(anInput())).rejects.toThrow(
      InvalidExecutionStatusError,
    );
    expect(queueRepository.update).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
