import { beforeEach, describe, expect, it } from 'bun:test';
import {
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
import { makeExecutionQueueItem } from '@/test/factories/make-execution-queue-item';
import {
  type CompleteDiagnosticInput,
  CompleteDiagnosticUseCase,
} from './complete-diagnostic';

const anInput = (
  override?: Partial<CompleteDiagnosticInput>,
): CompleteDiagnosticInput => ({
  serviceOrderId: 'service-order-id',
  diagnosedItems: {
    services: [
      {
        serviceId: 'service-id',
        description: 'Troca de correia',
        priceCents: 38000,
      },
    ],
    autoParts: [
      {
        autoPartId: 'auto-part-id',
        description: 'Filtro de óleo',
        quantity: 1,
        unitPriceCents: 4500,
      },
    ],
  },
  notes: 'Correia dentada com folga acima do limite',
  diagnosedBy: 'mecanico-07',
  ...override,
});

describe('CompleteDiagnosticUseCase', () => {
  let queueRepository: ReturnType<typeof makeQueueRepository>;
  let logRepository: ReturnType<typeof makeLogRepository>;
  let eventPublisher: ReturnType<typeof makeEventPublisher>;
  let metrics: ReturnType<typeof makeExecutionMetrics>;
  let useCase: CompleteDiagnosticUseCase;

  beforeEach(() => {
    queueRepository = makeQueueRepository();
    logRepository = makeLogRepository();
    eventPublisher = makeEventPublisher();
    metrics = makeExecutionMetrics();
    useCase = new CompleteDiagnosticUseCase(
      queueRepository,
      logRepository,
      eventPublisher,
      metrics,
    );

    queueRepository.findByServiceOrderId.mockResolvedValue(
      makeExecutionQueueItem({ correlationId: 'correlation-id' }),
    );
  });

  it('moves the service order to diagnosed with the real items', async () => {
    const queueItem = await useCase.execute(anInput());

    expect(queueItem.status).toBe(ExecutionStatus.DIAGNOSED);
    expect(queueItem.diagnosedBy).toBe('mecanico-07');
    expect(queueItem.diagnosedAt).toBeDate();
    expect(queueItem.diagnosedItems?.map((item) => item.kind)).toEqual([
      ExecutionItemKind.SERVICE,
      ExecutionItemKind.AUTO_PART,
    ]);
    expect(queueRepository.update).toHaveBeenCalledWith(queueItem);
  });

  it('keeps what the customer asked for apart from what was diagnosed', async () => {
    const queueItem = await useCase.execute(anInput());

    expect(queueItem.requestedItems[0]?.unitPrice?.amountCents).toBe(38000);
    expect(queueItem.diagnosedItems).toHaveLength(2);
    expect(queueItem.requestedItems).toHaveLength(1);
  });

  it('records the diagnostic in the history', async () => {
    await useCase.execute(anInput());

    const [log] = logRepository.append.mock.calls[0] ?? [];

    expect(log?.event).toBe('diagnostic-completed');
    expect(log?.status).toBe(ExecutionStatus.DIAGNOSED);
    expect(log?.detail).toBe('Correia dentada com folga acima do limite');
    expect(log?.metadata).toEqual({ diagnosedBy: 'mecanico-07' });
  });

  it('publishes the diagnostic in the shape of the contract', async () => {
    await useCase.execute(anInput());

    expect(eventPublisher.publish).toHaveBeenCalledWith({
      eventType: 'evt.workshop.diagnostic-completed',
      correlationId: 'correlation-id',
      data: {
        serviceOrderId: 'service-order-id',
        diagnosedItems: {
          services: [
            {
              serviceId: 'service-id',
              description: 'Troca de correia',
              priceCents: 38000,
            },
          ],
          autoParts: [
            {
              autoPartId: 'auto-part-id',
              description: 'Filtro de óleo',
              quantity: 1,
              unitPriceCents: 4500,
            },
          ],
        },
        notes: 'Correia dentada com folga acima do limite',
        diagnosedBy: 'mecanico-07',
        currency: 'BRL',
      },
    });
  });

  it('measures how long the diagnostic took', async () => {
    const queueItem = await useCase.execute(anInput());

    expect(metrics.diagnosticFinished).toHaveBeenCalledWith(queueItem);
  });

  it('prices the diagnosed items in the currency of the service order', async () => {
    queueRepository.findByServiceOrderId.mockResolvedValue(
      makeExecutionQueueItem({ currency: 'USD' }),
    );

    const queueItem = await useCase.execute(anInput());

    expect(queueItem.diagnosedItems?.[0]?.unitPrice?.currency).toBe('USD');
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

  it('refuses to diagnose a service order that is no longer in diagnostic', async () => {
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
