import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { CompleteExecutionItemsInput } from '@/application/use-cases/execution/complete-execution-items';
import type { FailExecutionInput } from '@/application/use-cases/execution/fail-execution';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import {
  ExecutionItemAlreadyCompletedError,
  ExecutionItemNotFoundError,
  ExecutionNotFoundError,
  InvalidExecutionStatusError,
} from '@/domain/execution/errors/execution-errors';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import { makeExecutionItem } from '@/test/factories/make-execution-item';
import { makeExecutionQueueItem } from '@/test/factories/make-execution-queue-item';
import { makeExecutionRoutes } from './execution-routes';

const serviceOrderId = crypto.randomUUID();
const serviceId = crypto.randomUUID();
const otherServiceId = crypto.randomUUID();

const aBody = (override?: Record<string, unknown>) => ({
  services: [{ serviceId }],
  ...override,
});

const patch = (
  app: ReturnType<typeof makeExecutionRoutes>,
  body: unknown,
  id: string = serviceOrderId,
) =>
  app.handle(
    new Request(`http://localhost/executions/${id}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const makeFail = () =>
  mock(
    async (input: FailExecutionInput): Promise<ExecutionQueueItem> =>
      makeExecutionQueueItem({
        serviceOrderId: input.serviceOrderId,
        status: ExecutionStatus.FAILED,
        failureReason: input.reason,
        failureDetail: input.detail,
        failedAt: new Date('2026-09-17T17:30:00.000Z'),
        executionItems: [
          makeExecutionItem({
            referenceId: serviceId,
            failedAt: new Date('2026-09-17T17:30:00.000Z'),
          }),
          makeExecutionItem({ referenceId: otherServiceId, isCompleted: true }),
        ],
      }),
  );

const makeExecute = () =>
  mock(
    async (input: CompleteExecutionItemsInput): Promise<ExecutionQueueItem> =>
      makeExecutionQueueItem({
        serviceOrderId: input.serviceOrderId,
        status: ExecutionStatus.IN_EXECUTION,
        executionItems: [
          makeExecutionItem({
            referenceId: serviceId,
            isCompleted: true,
            finishedAt: new Date('2026-09-17T16:00:00.000Z'),
            executionTimeMs: 5400000,
          }),
          makeExecutionItem({ referenceId: otherServiceId }),
        ],
      }),
  );

describe('PATCH /executions/:serviceOrderId/items', () => {
  let useCase: { execute: ReturnType<typeof makeExecute> };
  let app: ReturnType<typeof makeExecutionRoutes>;

  beforeEach(() => {
    useCase = { execute: makeExecute() };
    app = makeExecutionRoutes(useCase, { execute: makeFail() });
  });

  it('completes the services the mechanic finished', async () => {
    const response = await patch(app, aBody());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      serviceOrderId,
      status: 'IN_EXECUTION',
      services: [
        {
          serviceId,
          isCompleted: true,
          finishedAt: '2026-09-17T16:00:00.000Z',
          executionTimeMs: 5400000,
        },
        { serviceId: otherServiceId, isCompleted: false },
      ],
    });
    expect(useCase.execute).toHaveBeenCalledWith({
      serviceOrderId,
      serviceIds: [serviceId],
    });
  });

  it('answers when the whole execution was completed', async () => {
    useCase.execute.mockResolvedValueOnce(
      makeExecutionQueueItem({
        serviceOrderId,
        status: ExecutionStatus.COMPLETED,
        completedAt: new Date('2026-09-17T16:00:00.000Z'),
      }),
    );

    const response = await patch(app, aBody());

    expect(await response.json()).toMatchObject({
      status: 'COMPLETED',
      completedAt: '2026-09-17T16:00:00.000Z',
    });
  });

  it('answers 404 for a service order that is not in the queue', async () => {
    useCase.execute.mockRejectedValueOnce(
      new ExecutionNotFoundError(serviceOrderId),
    );

    const response = await patch(app, aBody());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      message: `Service order ${serviceOrderId} is not in the workshop queue`,
    });
  });

  it('answers 422 for a service that is not part of the execution', async () => {
    useCase.execute.mockRejectedValueOnce(
      new ExecutionItemNotFoundError(serviceOrderId, serviceId),
    );

    const response = await patch(app, aBody());

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      message: `Service ${serviceId} is not part of the execution of service order ${serviceOrderId}`,
    });
  });

  it('answers 409 for a service order that is not in execution', async () => {
    useCase.execute.mockRejectedValueOnce(
      new InvalidExecutionStatusError(
        'complete items of',
        ExecutionStatus.ABORTED,
      ),
    );

    const response = await patch(app, aBody());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: 'Cannot complete items of a service order that is ABORTED',
    });
  });

  it('lets an unexpected failure surface as a server error', async () => {
    useCase.execute.mockRejectedValueOnce(new Error('broker down'));

    const response = await patch(app, aBody());

    expect(response.status).toBe(500);
  });

  it('refuses a request without any service', async () => {
    const response = await patch(app, aBody({ services: [] }));

    expect(response.status).toBe(422);
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('refuses a service id that is not a uuid', async () => {
    const response = await patch(
      app,
      aBody({ services: [{ serviceId: 'not-a-uuid' }] }),
    );

    expect(response.status).toBe(422);
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('refuses a service order id that is not a uuid', async () => {
    const response = await patch(app, aBody(), 'not-a-uuid');

    expect(response.status).toBe(422);
    expect(useCase.execute).not.toHaveBeenCalled();
  });
});

describe('POST /executions/:serviceOrderId/failure', () => {
  let failUseCase: { execute: ReturnType<typeof makeFail> };
  let app: ReturnType<typeof makeExecutionRoutes>;

  const post = (body: unknown, id: string = serviceOrderId) =>
    app.handle(
      new Request(`http://localhost/executions/${id}/failure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  beforeEach(() => {
    failUseCase = { execute: makeFail() };
    app = makeExecutionRoutes({ execute: makeExecute() }, failUseCase);
  });

  it('fails the execution in a single call, as the demonstration needs', async () => {
    const response = await post({
      reason: 'PART_UNAVAILABLE',
      detail: 'Correia dentada sem estoque no fornecedor',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      serviceOrderId,
      status: 'FAILED',
      reason: 'PART_UNAVAILABLE',
      detail: 'Correia dentada sem estoque no fornecedor',
      failedAt: '2026-09-17T17:30:00.000Z',
      failedItems: [{ serviceId }],
    });
    expect(failUseCase.execute).toHaveBeenCalledWith({
      serviceOrderId,
      reason: 'PART_UNAVAILABLE',
      detail: 'Correia dentada sem estoque no fornecedor',
      serviceIds: undefined,
    });
  });

  it('passes on which services failed when the mechanic tells', async () => {
    await post({ reason: 'PART_UNAVAILABLE', services: [{ serviceId }] });

    expect(failUseCase.execute.mock.calls[0]?.[0].serviceIds).toEqual([
      serviceId,
    ]);
  });

  it('answers 404 for a service order that is not in the queue', async () => {
    failUseCase.execute.mockRejectedValueOnce(
      new ExecutionNotFoundError(serviceOrderId),
    );

    const response = await post({ reason: 'PART_UNAVAILABLE' });

    expect(response.status).toBe(404);
  });

  it('answers 409 for a service that was already completed', async () => {
    failUseCase.execute.mockRejectedValueOnce(
      new ExecutionItemAlreadyCompletedError(serviceOrderId, serviceId),
    );

    const response = await post({
      reason: 'PART_UNAVAILABLE',
      services: [{ serviceId }],
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: `Service ${serviceId} of service order ${serviceOrderId} is already completed`,
    });
  });

  it('answers 422 for a service that is not part of the execution', async () => {
    failUseCase.execute.mockRejectedValueOnce(
      new ExecutionItemNotFoundError(serviceOrderId, serviceId),
    );

    const response = await post({
      reason: 'PART_UNAVAILABLE',
      services: [{ serviceId }],
    });

    expect(response.status).toBe(422);
  });

  it('lets an unexpected failure surface as a server error', async () => {
    failUseCase.execute.mockRejectedValueOnce(new Error('broker down'));

    const response = await post({ reason: 'PART_UNAVAILABLE' });

    expect(response.status).toBe(500);
  });

  it('refuses a reason outside the contract', async () => {
    const response = await post({ reason: 'sem peça' });

    expect(response.status).toBe(422);
    expect(failUseCase.execute).not.toHaveBeenCalled();
  });
});
