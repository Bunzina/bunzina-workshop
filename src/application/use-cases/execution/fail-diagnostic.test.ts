import { beforeEach, describe, expect, it } from 'bun:test';
import {
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
import { makeExecutionQueueItem } from '@/test/factories/make-execution-queue-item';
import {
  type FailDiagnosticInput,
  FailDiagnosticUseCase,
} from './fail-diagnostic';

const anInput = (
  override?: Partial<FailDiagnosticInput>,
): FailDiagnosticInput => ({
  serviceOrderId: 'service-order-id',
  reason: 'UNREPAIRABLE',
  detail: 'Bloco do motor trincado',
  ...override,
});

describe('FailDiagnosticUseCase', () => {
  let queueRepository: ReturnType<typeof makeQueueRepository>;
  let logRepository: ReturnType<typeof makeLogRepository>;
  let eventPublisher: ReturnType<typeof makeEventPublisher>;
  let metrics: ReturnType<typeof makeExecutionMetrics>;
  let useCase: FailDiagnosticUseCase;

  beforeEach(() => {
    queueRepository = makeQueueRepository();
    logRepository = makeLogRepository();
    eventPublisher = makeEventPublisher();
    metrics = makeExecutionMetrics();
    useCase = new FailDiagnosticUseCase(
      queueRepository,
      logRepository,
      eventPublisher,
      metrics,
    );

    queueRepository.findByServiceOrderId.mockResolvedValue(
      makeExecutionQueueItem({ correlationId: 'correlation-id' }),
    );
  });

  it('moves the service order to failed with the reason', async () => {
    const queueItem = await useCase.execute(anInput());

    expect(queueItem.status).toBe(ExecutionStatus.FAILED);
    expect(queueItem.failureReason).toBe('UNREPAIRABLE');
    expect(queueItem.failedAt).toBeDate();
    expect(queueRepository.update).toHaveBeenCalledWith(queueItem);
  });

  it('records the failure and its reason in the history', async () => {
    await useCase.execute(anInput());

    const [log] = logRepository.append.mock.calls[0] ?? [];

    expect(log?.event).toBe('diagnostic-failed');
    expect(log?.status).toBe(ExecutionStatus.FAILED);
    expect(log?.reason).toBe('UNREPAIRABLE');
    expect(log?.detail).toBe('Bloco do motor trincado');
  });

  it('publishes the failure in the shape of the contract', async () => {
    await useCase.execute(anInput());

    expect(eventPublisher.publish).toHaveBeenCalledWith({
      eventType: 'evt.workshop.diagnostic-failed',
      correlationId: 'correlation-id',
      data: {
        serviceOrderId: 'service-order-id',
        reason: 'UNREPAIRABLE',
        detail: 'Bloco do motor trincado',
      },
    });
  });

  it('measures how long the diagnostic took until it failed', async () => {
    const queueItem = await useCase.execute(anInput());

    expect(metrics.diagnosticFinished).toHaveBeenCalledWith(queueItem);
  });

  it('falls back to the service order id when no correlation id was kept', async () => {
    queueRepository.findByServiceOrderId.mockResolvedValue(
      makeExecutionQueueItem(),
    );

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

  it('refuses a service order that is no longer in diagnostic', async () => {
    queueRepository.findByServiceOrderId.mockResolvedValue(
      makeExecutionQueueItem({ status: ExecutionStatus.DIAGNOSED }),
    );

    await expect(useCase.execute(anInput())).rejects.toThrow(
      InvalidExecutionStatusError,
    );
    expect(queueRepository.update).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
