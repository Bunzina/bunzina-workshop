import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { StartExecutionInput } from '@/application/use-cases/execution/start-execution';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import { buildEnvelope } from '@/infrastructure/messaging/envelope';
import { makeStartExecutionHandler } from './start-execution-handler';

const serviceOrderId = crypto.randomUUID();
const serviceId = crypto.randomUUID();
const autoPartId = crypto.randomUUID();

const aPayload = (override?: Record<string, unknown>) => ({
  serviceOrderId,
  items: {
    services: [{ serviceId, description: 'Troca de correia' }],
    autoParts: [{ autoPartId, description: 'Filtro de óleo', quantity: 1 }],
  },
  ...override,
});

const envelopeFor = (data: Record<string, unknown>) =>
  buildEnvelope({
    eventType: 'cmd.workshop.start-execution',
    correlationId: crypto.randomUUID(),
    data,
  });

const makeExecute = () =>
  mock(
    async (_input: StartExecutionInput) =>
      ({}) as unknown as ExecutionQueueItem,
  );

describe('makeStartExecutionHandler', () => {
  let useCase: { execute: ReturnType<typeof makeExecute> };
  let handle: ReturnType<typeof makeStartExecutionHandler>;

  beforeEach(() => {
    useCase = { execute: makeExecute() };
    handle = makeStartExecutionHandler(useCase);
  });

  it('hands the approved items to the use case', async () => {
    await handle(envelopeFor(aPayload()));

    expect(useCase.execute).toHaveBeenCalledWith({
      serviceOrderId,
      items: {
        services: [{ serviceId, description: 'Troca de correia' }],
        autoParts: [{ autoPartId, description: 'Filtro de óleo', quantity: 1 }],
      },
    });
  });

  it('drops any price that comes along with the items', async () => {
    await handle(
      envelopeFor(
        aPayload({
          items: {
            services: [{ serviceId, priceCents: 38000 }],
            autoParts: [],
          },
        }),
      ),
    );

    const [input] = useCase.execute.mock.calls[0] ?? [];

    expect(input?.items.services).toEqual([{ serviceId }]);
  });

  it('takes a missing group of items as an empty one', async () => {
    await handle(
      envelopeFor(aPayload({ items: { services: [], autoParts: undefined } })),
    );

    const [input] = useCase.execute.mock.calls[0] ?? [];

    expect(input?.items.autoParts).toEqual([]);
  });

  it('refuses a payload that is out of contract', async () => {
    await expect(
      handle(envelopeFor(aPayload({ serviceOrderId: 'not-a-uuid' }))),
    ).rejects.toThrow();
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('refuses an auto part without quantity', async () => {
    await expect(
      handle(
        envelopeFor(
          aPayload({ items: { services: [], autoParts: [{ autoPartId }] } }),
        ),
      ),
    ).rejects.toThrow();
  });
});
