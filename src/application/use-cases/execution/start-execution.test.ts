import { beforeEach, describe, expect, it } from 'bun:test';
import {
  ExecutionNotFoundError,
  InvalidExecutionStatusError,
} from '@/domain/execution/errors/execution-errors';
import { ExecutionItemKind } from '@/domain/execution/types/execution-item-kind';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import {
  makeLogRepository,
  makeQueueRepository,
} from '@/test/factories/make-execution-doubles';
import { makeExecutionQueueItem } from '@/test/factories/make-execution-queue-item';
import {
  type StartExecutionInput,
  StartExecutionUseCase,
} from './start-execution';

const anInput = (
  override?: Partial<StartExecutionInput>,
): StartExecutionInput => ({
  serviceOrderId: 'service-order-id',
  items: {
    services: [{ serviceId: 'service-id', description: 'Troca de correia' }],
    autoParts: [
      {
        autoPartId: 'auto-part-id',
        description: 'Filtro de óleo',
        quantity: 2,
      },
    ],
  },
  ...override,
});

describe('StartExecutionUseCase', () => {
  let queueRepository: ReturnType<typeof makeQueueRepository>;
  let logRepository: ReturnType<typeof makeLogRepository>;
  let useCase: StartExecutionUseCase;

  const givenServiceOrderIs = (status: ExecutionStatus) => {
    const queueItem = makeExecutionQueueItem({ status });
    queueRepository.findByServiceOrderId.mockResolvedValue(queueItem);
    return queueItem;
  };

  beforeEach(() => {
    queueRepository = makeQueueRepository();
    logRepository = makeLogRepository();
    useCase = new StartExecutionUseCase(queueRepository, logRepository);
  });

  it('moves a diagnosed service order into execution', async () => {
    givenServiceOrderIs(ExecutionStatus.DIAGNOSED);

    const queueItem = await useCase.execute(anInput());

    expect(queueItem.status).toBe(ExecutionStatus.IN_EXECUTION);
    expect(queueItem.startedAt).toBeDate();
    expect(queueRepository.update).toHaveBeenCalledWith(queueItem);
  });

  it('keeps the approved items without any price', async () => {
    givenServiceOrderIs(ExecutionStatus.DIAGNOSED);

    const queueItem = await useCase.execute(anInput());

    expect(
      queueItem.executionItems?.map((item) => ({
        kind: item.kind,
        referenceId: item.referenceId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    ).toEqual([
      {
        kind: ExecutionItemKind.SERVICE,
        referenceId: 'service-id',
        quantity: 1,
        unitPrice: undefined,
      },
      {
        kind: ExecutionItemKind.AUTO_PART,
        referenceId: 'auto-part-id',
        quantity: 2,
        unitPrice: undefined,
      },
    ]);
  });

  it('records the start of the execution in the history', async () => {
    givenServiceOrderIs(ExecutionStatus.DIAGNOSED);

    await useCase.execute(anInput());

    const [log] = logRepository.append.mock.calls[0] ?? [];

    expect(log?.event).toBe('execution-started');
    expect(log?.status).toBe(ExecutionStatus.IN_EXECUTION);
  });

  describe.each([
    ExecutionStatus.ABORTED,
    ExecutionStatus.COMPLETED,
    ExecutionStatus.FAILED,
    ExecutionStatus.IN_EXECUTION,
  ])('over a service order that is already %s', (status) => {
    it('resurrects nothing', async () => {
      const existing = givenServiceOrderIs(status);

      const queueItem = await useCase.execute(anInput());

      expect(queueItem).toBe(existing);
      expect(queueItem.status).toBe(status);
      expect(queueItem.executionItems).toBeUndefined();
      expect(queueRepository.update).not.toHaveBeenCalled();
      expect(logRepository.append).not.toHaveBeenCalled();
    });
  });

  it('refuses to execute a service order that was never diagnosed', async () => {
    givenServiceOrderIs(ExecutionStatus.IN_DIAGNOSTIC);

    await expect(useCase.execute(anInput())).rejects.toThrow(
      InvalidExecutionStatusError,
    );
    expect(queueRepository.update).not.toHaveBeenCalled();
  });

  it('refuses a service order that is not in the queue', async () => {
    await expect(useCase.execute(anInput())).rejects.toThrow(
      ExecutionNotFoundError,
    );
  });
});
