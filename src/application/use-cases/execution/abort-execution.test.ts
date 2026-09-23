import { beforeEach, describe, expect, it } from 'bun:test';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import {
  makeEventPublisher,
  makeLogRepository,
  makeQueueRepository,
} from '@/test/factories/make-execution-doubles';
import { makeExecutionQueueItem } from '@/test/factories/make-execution-queue-item';
import {
  type AbortExecutionInput,
  AbortExecutionUseCase,
} from './abort-execution';

const anInput = (
  override?: Partial<AbortExecutionInput>,
): AbortExecutionInput => ({
  serviceOrderId: 'service-order-id',
  reason: 'TIMEOUT',
  detail: 'Cliente não aprovou o orçamento a tempo',
  correlationId: 'correlation-id',
  causationId: 'abort-command-id',
  ...override,
});

describe('AbortExecutionUseCase', () => {
  let queueRepository: ReturnType<typeof makeQueueRepository>;
  let logRepository: ReturnType<typeof makeLogRepository>;
  let eventPublisher: ReturnType<typeof makeEventPublisher>;
  let useCase: AbortExecutionUseCase;

  const givenServiceOrderIs = (status: ExecutionStatus) => {
    const queueItem = makeExecutionQueueItem({ status });
    queueRepository.findByServiceOrderId.mockResolvedValue(queueItem);
    return queueItem;
  };

  beforeEach(() => {
    queueRepository = makeQueueRepository();
    logRepository = makeLogRepository();
    eventPublisher = makeEventPublisher();
    useCase = new AbortExecutionUseCase(
      queueRepository,
      logRepository,
      eventPublisher,
    );
  });

  describe.each([
    ['during the diagnostic', ExecutionStatus.IN_DIAGNOSTIC],
    ['after the diagnostic', ExecutionStatus.DIAGNOSED],
    ['during the execution', ExecutionStatus.IN_EXECUTION],
  ])('%s', (_moment, status) => {
    it('marks the service order as aborted with the reason', async () => {
      givenServiceOrderIs(status);

      const queueItem = await useCase.execute(anInput());

      expect(queueItem?.status).toBe(ExecutionStatus.ABORTED);
      expect(queueItem?.failureReason).toBe('TIMEOUT');
      expect(queueItem?.failureDetail).toBe(
        'Cliente não aprovou o orçamento a tempo',
      );
      expect(queueRepository.update).toHaveBeenCalledWith(queueItem);
    });

    it('records the abort and where it happened in the history', async () => {
      givenServiceOrderIs(status);

      await useCase.execute(anInput());

      const [log] = logRepository.append.mock.calls[0] ?? [];

      expect(log?.event).toBe('execution-aborted');
      expect(log?.status).toBe(ExecutionStatus.ABORTED);
      expect(log?.reason).toBe('TIMEOUT');
      expect(log?.detail).toBe('Cliente não aprovou o orçamento a tempo');
      expect(log?.metadata).toEqual({ previousStatus: status });
    });

    it('tells the orchestrator the execution was aborted', async () => {
      givenServiceOrderIs(status);

      const queueItem = await useCase.execute(anInput());

      expect(eventPublisher.publish).toHaveBeenCalledWith({
        eventType: 'evt.workshop.execution-aborted',
        correlationId: 'correlation-id',
        causationId: 'abort-command-id',
        data: {
          serviceOrderId: 'service-order-id',
          abortedAt: queueItem?.abortedAt?.toISOString(),
        },
      });
    });
  });

  describe.each([
    ExecutionStatus.COMPLETED,
    ExecutionStatus.FAILED,
    ExecutionStatus.ABORTED,
  ])('over a service order that is already %s', (status) => {
    it('changes nothing and publishes nothing', async () => {
      const existing = givenServiceOrderIs(status);

      const queueItem = await useCase.execute(anInput());

      expect(queueItem).toBe(existing);
      expect(queueItem?.status).toBe(status);
      expect(queueRepository.update).not.toHaveBeenCalled();
      expect(logRepository.append).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });
  });

  it('ignores a service order the workshop never received', async () => {
    const queueItem = await useCase.execute(anInput());

    expect(queueItem).toBeNull();
    expect(queueRepository.update).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
