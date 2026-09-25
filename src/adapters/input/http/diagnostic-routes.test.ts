import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { CompleteDiagnosticInput } from '@/application/use-cases/execution/complete-diagnostic';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import {
  ExecutionNotFoundError,
  InvalidExecutionStatusError,
} from '@/domain/execution/errors/execution-errors';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import { makeExecutionQueueItem } from '@/test/factories/make-execution-queue-item';
import { makeDiagnosticRoutes } from './diagnostic-routes';

const serviceOrderId = crypto.randomUUID();
const serviceId = crypto.randomUUID();

const aBody = (override?: Record<string, unknown>) => ({
  diagnosedItems: {
    services: [
      { serviceId, description: 'Troca de correia', priceCents: 38000 },
    ],
  },
  notes: 'Correia dentada com folga acima do limite',
  diagnosedBy: 'mecanico-07',
  ...override,
});

const patch = (
  app: ReturnType<typeof makeDiagnosticRoutes>,
  body: unknown,
  id: string = serviceOrderId,
) =>
  app.handle(
    new Request(`http://localhost/diagnostics/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const makeExecute = () =>
  mock(
    async (input: CompleteDiagnosticInput): Promise<ExecutionQueueItem> =>
      makeExecutionQueueItem({
        serviceOrderId: input.serviceOrderId,
        status: ExecutionStatus.DIAGNOSED,
        diagnosedAt: new Date('2026-09-17T16:30:00.000Z'),
      }),
  );

describe('PATCH /diagnostics/:serviceOrderId', () => {
  let useCase: { execute: ReturnType<typeof makeExecute> };
  let app: ReturnType<typeof makeDiagnosticRoutes>;

  beforeEach(() => {
    useCase = { execute: makeExecute() };
    app = makeDiagnosticRoutes(useCase);
  });

  it('completes the diagnostic with what the mechanic found', async () => {
    const response = await patch(app, aBody());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      serviceOrderId,
      status: 'DIAGNOSED',
      diagnosedAt: '2026-09-17T16:30:00.000Z',
    });
    expect(useCase.execute).toHaveBeenCalledWith({
      serviceOrderId,
      diagnosedItems: {
        services: [
          { serviceId, description: 'Troca de correia', priceCents: 38000 },
        ],
        autoParts: [],
      },
      notes: 'Correia dentada com folga acima do limite',
      diagnosedBy: 'mecanico-07',
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

  it('answers 409 for a service order that is no longer in diagnostic', async () => {
    useCase.execute.mockRejectedValueOnce(
      new InvalidExecutionStatusError('diagnose', ExecutionStatus.ABORTED),
    );

    const response = await patch(app, aBody());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: 'Cannot diagnose a service order that is ABORTED',
    });
  });

  it('lets an unexpected failure surface as a server error', async () => {
    useCase.execute.mockRejectedValueOnce(new Error('broker down'));

    const response = await patch(app, aBody());

    expect(response.status).toBe(500);
  });

  it('refuses a diagnostic without who made it', async () => {
    const response = await patch(app, aBody({ diagnosedBy: ' ' }));

    expect(response.status).toBe(422);
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('refuses a price that is not an integer of cents', async () => {
    const response = await patch(
      app,
      aBody({
        diagnosedItems: {
          services: [{ serviceId, priceCents: 380.5 }],
        },
      }),
    );

    expect(response.status).toBe(422);
  });

  it('refuses a service order id that is not a uuid', async () => {
    const response = await patch(app, aBody(), 'not-a-uuid');

    expect(response.status).toBe(422);
    expect(useCase.execute).not.toHaveBeenCalled();
  });
});
