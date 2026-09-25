import { beforeEach, describe, expect, it } from 'bun:test';
import { ExecutionItemKind } from '@/domain/execution/types/execution-item-kind';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import {
  makeLogRepository,
  makeQueueRepository,
} from '@/test/factories/make-execution-doubles';
import { makeExecutionQueueItem } from '@/test/factories/make-execution-queue-item';
import {
  StartDiagnosticUseCase,
  type StartDiagnosticInput,
} from './start-diagnostic';

const anInput = (
  override?: Partial<StartDiagnosticInput>,
): StartDiagnosticInput => ({
  serviceOrderId: 'service-order-id',
  correlationId: 'correlation-id',
  vehicle: { id: 'vehicle-id', plate: 'ABC1D23', model: 'Gol 1.6' },
  requestedItems: {
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
        quantity: 2,
        unitPriceCents: 4500,
      },
    ],
  },
  currency: 'BRL',
  ...override,
});

describe('StartDiagnosticUseCase', () => {
  let queueRepository: ReturnType<typeof makeQueueRepository>;
  let logRepository: ReturnType<typeof makeLogRepository>;
  let useCase: StartDiagnosticUseCase;

  beforeEach(() => {
    queueRepository = makeQueueRepository();
    logRepository = makeLogRepository();
    useCase = new StartDiagnosticUseCase(queueRepository, logRepository);
  });

  it('puts the service order in the queue under diagnostic', async () => {
    const queueItem = await useCase.execute(anInput());

    expect(queueRepository.create).toHaveBeenCalledWith(queueItem);
    expect(queueItem.serviceOrderId).toBe('service-order-id');
    expect(queueItem.status).toBe(ExecutionStatus.IN_DIAGNOSTIC);
    expect(queueItem.currency).toBe('BRL');
  });

  it('keeps the correlation id of the saga to answer it later', async () => {
    const queueItem = await useCase.execute(anInput());

    expect(queueItem.correlationId).toBe('correlation-id');
  });

  it('keeps the vehicle that came with the command', async () => {
    const queueItem = await useCase.execute(anInput());

    expect(queueItem.vehicle.plate).toBe('ABC1D23');
    expect(queueItem.vehicle.model).toBe('Gol 1.6');
  });

  it('turns the requested services into items priced in cents', async () => {
    const queueItem = await useCase.execute(anInput());
    const service = queueItem.requestedItems[0];

    expect(service?.kind).toBe(ExecutionItemKind.SERVICE);
    expect(service?.referenceId).toBe('service-id');
    expect(service?.quantity).toBe(1);
    expect(service?.unitPrice?.amountCents).toBe(38000);
  });

  it('totals the requested auto parts by quantity', async () => {
    const queueItem = await useCase.execute(anInput());
    const autoPart = queueItem.requestedItems[1];

    expect(autoPart?.kind).toBe(ExecutionItemKind.AUTO_PART);
    expect(autoPart?.referenceId).toBe('auto-part-id');
    expect(autoPart?.quantity).toBe(2);
    expect(autoPart?.totalPrice?.amountCents).toBe(9000);
  });

  it('prices every item in the currency of the command', async () => {
    const queueItem = await useCase.execute(anInput({ currency: 'USD' }));

    expect(queueItem.requestedItems[0]?.unitPrice?.currency).toBe('USD');
  });

  it('records the start of the diagnostic in the history', async () => {
    await useCase.execute(anInput());

    const [log] = logRepository.append.mock.calls[0] ?? [];

    expect(log?.serviceOrderId).toBe('service-order-id');
    expect(log?.event).toBe('diagnostic-started');
    expect(log?.status).toBe(ExecutionStatus.IN_DIAGNOSTIC);
  });

  it('does not queue the same service order twice', async () => {
    const existing = makeExecutionQueueItem();
    queueRepository.findByServiceOrderId.mockResolvedValue(existing);

    const queueItem = await useCase.execute(anInput());

    expect(queueItem).toBe(existing);
    expect(queueRepository.create).not.toHaveBeenCalled();
    expect(logRepository.append).not.toHaveBeenCalled();
  });

  it('accepts a command with no items at all', async () => {
    const queueItem = await useCase.execute(
      anInput({ requestedItems: { services: [], autoParts: [] } }),
    );

    expect(queueItem.requestedItems).toEqual([]);
  });
});
