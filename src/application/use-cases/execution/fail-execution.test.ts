import { beforeEach, describe, expect, it } from 'bun:test';
import {
  ExecutionItemNotFoundError,
  ExecutionNotFoundError,
  InvalidExecutionStatusError,
} from '@/domain/execution/errors/execution-errors';
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
  type FailExecutionInput,
  FailExecutionUseCase,
} from './fail-execution';

const anInput = (
  override?: Partial<FailExecutionInput>,
): FailExecutionInput => ({
  serviceOrderId: 'service-order-id',
  reason: 'PART_UNAVAILABLE',
  detail: 'Correia dentada sem estoque no fornecedor',
  ...override,
});

const inExecution = (override?: { correlationId?: string }) =>
  makeExecutionQueueItem({
    status: ExecutionStatus.IN_EXECUTION,
    executionItems: [
      makeExecutionItem({
        id: 'item-1',
        referenceId: 'service-1',
        isCompleted: true,
      }),
      makeExecutionItem({ id: 'item-2', referenceId: 'service-2' }),
    ],
    ...override,
  });

describe('FailExecutionUseCase', () => {
  let queueRepository: ReturnType<typeof makeQueueRepository>;
  let logRepository: ReturnType<typeof makeLogRepository>;
  let eventPublisher: ReturnType<typeof makeEventPublisher>;
  let metrics: ReturnType<typeof makeExecutionMetrics>;
  let useCase: FailExecutionUseCase;

  beforeEach(() => {
    queueRepository = makeQueueRepository();
    logRepository = makeLogRepository();
    eventPublisher = makeEventPublisher();
    metrics = makeExecutionMetrics();
    useCase = new FailExecutionUseCase(
      queueRepository,
      logRepository,
      eventPublisher,
      metrics,
    );

    queueRepository.findByServiceOrderId.mockResolvedValue(
      inExecution({ correlationId: 'correlation-id' }),
    );
  });

  it('moves the service order to failed with the reason', async () => {
    const queueItem = await useCase.execute(anInput());

    expect(queueItem.status).toBe(ExecutionStatus.FAILED);
    expect(queueItem.failureReason).toBe('PART_UNAVAILABLE');
    expect(queueItem.failedAt).toBeDate();
    expect(queueRepository.update).toHaveBeenCalledWith(queueItem);
  });

  it('records the failure and the failed services in the history', async () => {
    await useCase.execute(anInput());

    const [log] = logRepository.append.mock.calls[0] ?? [];

    expect(log?.event).toBe('execution-failed');
    expect(log?.status).toBe(ExecutionStatus.FAILED);
    expect(log?.reason).toBe('PART_UNAVAILABLE');
    expect(log?.metadata).toEqual({
      failedItems: [{ serviceId: 'service-2' }],
    });
  });

  it('publishes the failure in the shape of the contract', async () => {
    await useCase.execute(anInput());

    expect(eventPublisher.publish).toHaveBeenCalledWith({
      eventType: 'evt.workshop.execution-failed',
      correlationId: 'correlation-id',
      data: {
        serviceOrderId: 'service-order-id',
        reason: 'PART_UNAVAILABLE',
        detail: 'Correia dentada sem estoque no fornecedor',
        failedItems: [{ serviceId: 'service-2' }],
      },
    });
  });

  it('publishes only the services the mechanic named', async () => {
    queueRepository.findByServiceOrderId.mockResolvedValue(
      makeExecutionQueueItem({
        status: ExecutionStatus.IN_EXECUTION,
        executionItems: [
          makeExecutionItem({ id: 'item-1', referenceId: 'service-1' }),
          makeExecutionItem({ id: 'item-2', referenceId: 'service-2' }),
        ],
      }),
    );

    await useCase.execute(anInput({ serviceIds: ['service-1'] }));

    const [event] = eventPublisher.publish.mock.calls[0] ?? [];

    expect(event?.data.failedItems).toEqual([{ serviceId: 'service-1' }]);
  });

  it('measures how long the execution took until it failed', async () => {
    const queueItem = await useCase.execute(anInput());

    expect(metrics.executionFinished).toHaveBeenCalledWith(queueItem);
  });

  it('falls back to the service order id when no correlation id was kept', async () => {
    queueRepository.findByServiceOrderId.mockResolvedValue(inExecution());

    await useCase.execute(anInput());

    const [event] = eventPublisher.publish.mock.calls[0] ?? [];

    expect(event?.correlationId).toBe('service-order-id');
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
    expect(eventPublisher.publish).not.toHaveBeenCalled();
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
