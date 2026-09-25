import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { StartDiagnosticInput } from '@/application/use-cases/execution/start-diagnostic';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import { buildEnvelope } from '@/infrastructure/messaging/envelope';
import { makeStartDiagnosticHandler } from './start-diagnostic-handler';

const serviceOrderId = crypto.randomUUID();
const vehicleId = crypto.randomUUID();
const serviceId = crypto.randomUUID();

const aPayload = (override?: Record<string, unknown>) => ({
  serviceOrderId,
  vehicle: { id: vehicleId, plate: 'ABC1D23', model: 'Gol 1.6' },
  requestedItems: {
    services: [
      { serviceId, description: 'Troca de correia', priceCents: 38000 },
    ],
    autoParts: [],
  },
  currency: 'BRL',
  ...override,
});

const envelopeFor = (data: Record<string, unknown>) =>
  buildEnvelope({
    eventType: 'cmd.workshop.start-diagnostic',
    correlationId: crypto.randomUUID(),
    data,
  });

const makeExecute = () =>
  mock(
    async (_input: StartDiagnosticInput) =>
      ({}) as unknown as ExecutionQueueItem,
  );

describe('makeStartDiagnosticHandler', () => {
  let useCase: { execute: ReturnType<typeof makeExecute> };
  let handle: ReturnType<typeof makeStartDiagnosticHandler>;

  beforeEach(() => {
    useCase = { execute: makeExecute() };
    handle = makeStartDiagnosticHandler(useCase);
  });

  it('hands the command payload to the use case', async () => {
    const envelope = envelopeFor(aPayload());

    await handle(envelope);

    expect(useCase.execute).toHaveBeenCalledWith({
      serviceOrderId,
      correlationId: envelope.correlationId,
      vehicle: { id: vehicleId, plate: 'ABC1D23', model: 'Gol 1.6' },
      requestedItems: {
        services: [
          { serviceId, description: 'Troca de correia', priceCents: 38000 },
        ],
        autoParts: [],
      },
      currency: 'BRL',
    });
  });

  it('falls back to BRL when the command omits the currency', async () => {
    await handle(envelopeFor(aPayload({ currency: undefined })));

    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'BRL' }),
    );
  });

  it('takes a missing group of items as an empty one', async () => {
    await handle(
      envelopeFor(
        aPayload({ requestedItems: { services: [], autoParts: undefined } }),
      ),
    );

    const [input] = useCase.execute.mock.calls[0] ?? [];

    expect(input?.requestedItems.autoParts).toEqual([]);
  });

  it('refuses a payload that is out of contract', async () => {
    expect(
      handle(envelopeFor(aPayload({ serviceOrderId: 'not-a-uuid' }))),
    ).rejects.toThrow();
  });

  it('refuses an auto part without quantity', async () => {
    expect(
      handle(
        envelopeFor(
          aPayload({
            requestedItems: {
              services: [],
              autoParts: [
                { autoPartId: crypto.randomUUID(), unitPriceCents: 4500 },
              ],
            },
          }),
        ),
      ),
    ).rejects.toThrow();
  });
});
