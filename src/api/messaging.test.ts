import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Db } from 'mongodb';
import { buildEnvelope } from '@/infrastructure/messaging/envelope';
import { EXCHANGE, QUEUE } from '@/infrastructure/messaging/connection';

const documents = new Map<string, Record<string, unknown>[]>();

const collectionFor = (name: string) => ({
  insertOne: async (document: Record<string, unknown>) => {
    documents.set(name, [...(documents.get(name) ?? []), document]);
    return {};
  },
  findOne: async (filter: Record<string, unknown>) =>
    (documents.get(name) ?? []).find(
      (document) => document.serviceOrderId === filter.serviceOrderId,
    ) ?? null,
  find: () => ({
    sort: () => ({ toArray: async () => [] }),
    toArray: async () => [],
  }),
  updateOne: async (
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> },
  ) => {
    documents.set(
      name,
      (documents.get(name) ?? []).map((document) =>
        document.serviceOrderId === filter.serviceOrderId
          ? { ...document, ...update.$set }
          : document,
      ),
    );
    return {};
  },
});

const getDb = mock(
  async () => ({ collection: collectionFor }) as unknown as Db,
);

mock.module('@/infrastructure/configs/mongo', () => ({ getDb }));

const ack = mock(() => {});
const nack = mock(() => {});
const bindQueue = mock(async () => ({}) as never);
const publish = mock(
  (_exchange: string, _routingKey: string, _content: Buffer) => true,
);

let consumeCallback: ((message: unknown) => Promise<void>) | null = null;

const channel = {
  ack,
  publish,
  nack,
  bindQueue,
  consume: mock(async (_queue: string, callback: never) => {
    consumeCallback = callback as unknown as (
      message: unknown,
    ) => Promise<void>;
    return { consumerTag: 'tag' };
  }),
};

const { startMessaging } = await import('./messaging');

const deliveryOf = (envelope: ReturnType<typeof buildEnvelope>) => ({
  content: Buffer.from(JSON.stringify(envelope)),
  properties: { type: envelope.eventType, headers: {} },
});

const startDiagnosticDelivery = (serviceOrderId = crypto.randomUUID()) => {
  const envelope = buildEnvelope({
    eventType: 'cmd.workshop.start-diagnostic',
    correlationId: crypto.randomUUID(),
    data: {
      serviceOrderId,
      vehicle: { id: crypto.randomUUID(), plate: 'ABC1D23', model: 'Gol 1.6' },
      requestedItems: {
        services: [{ serviceId: crypto.randomUUID(), priceCents: 38000 }],
        autoParts: [],
      },
      currency: 'BRL',
    },
  });

  return deliveryOf(envelope);
};

const abortDelivery = (serviceOrderId: string) =>
  deliveryOf(
    buildEnvelope({
      eventType: 'cmd.workshop.abort',
      correlationId: crypto.randomUUID(),
      data: { serviceOrderId, reason: 'TIMEOUT', detail: 'Sem aprovação' },
    }),
  );

const startExecutionDelivery = (serviceOrderId: string) =>
  deliveryOf(
    buildEnvelope({
      eventType: 'cmd.workshop.start-execution',
      correlationId: crypto.randomUUID(),
      data: {
        serviceOrderId,
        items: {
          services: [{ serviceId: crypto.randomUUID() }],
          autoParts: [],
        },
      },
    }),
  );

const givenMechanicDiagnosed = (serviceOrderId: string) =>
  documents.set(
    'execution_queue',
    (documents.get('execution_queue') ?? []).map((document) =>
      document.serviceOrderId === serviceOrderId
        ? { ...document, status: 'DIAGNOSED' }
        : document,
    ),
  );

beforeEach(() => {
  documents.clear();
  ack.mockClear();
  nack.mockClear();
  bindQueue.mockClear();
  publish.mockClear();
  consumeCallback = null;
});

describe('startMessaging', () => {
  it('listens to every command addressed to the workshop', async () => {
    await startMessaging(channel as never);

    expect(bindQueue).toHaveBeenCalledWith(QUEUE, EXCHANGE, 'cmd.workshop.*');
  });

  it('queues the service order when a start-diagnostic command arrives', async () => {
    await startMessaging(channel as never);

    await consumeCallback?.(startDiagnosticDelivery());

    expect(documents.get('execution_queue')?.[0]).toMatchObject({
      status: 'IN_DIAGNOSTIC',
    });
    expect(documents.get('execution_logs')?.[0]).toMatchObject({
      event: 'diagnostic-started',
    });
    expect(ack).toHaveBeenCalledTimes(1);
    expect(nack).not.toHaveBeenCalled();
  });

  it('registers the event so a redelivery is ignored', async () => {
    await startMessaging(channel as never);

    await consumeCallback?.(startDiagnosticDelivery());

    expect(documents.get('processed_events')?.[0]).toMatchObject({
      consumer: 'bunzina-workshop',
    });
  });

  it('dead-letters a command that is out of contract', async () => {
    await startMessaging(channel as never);

    const envelope = buildEnvelope({
      eventType: 'cmd.workshop.start-diagnostic',
      correlationId: crypto.randomUUID(),
      data: { serviceOrderId: 'not-a-uuid' },
    });

    await consumeCallback?.({
      content: Buffer.from(JSON.stringify(envelope)),
      properties: { type: envelope.eventType, headers: {} },
    });

    expect(nack).toHaveBeenCalledTimes(1);
    expect(documents.get('execution_queue')).toBeUndefined();
  });

  it('aborts a service order under diagnostic and tells the orchestrator', async () => {
    const serviceOrderId = crypto.randomUUID();
    await startMessaging(channel as never);
    await consumeCallback?.(startDiagnosticDelivery(serviceOrderId));

    await consumeCallback?.(abortDelivery(serviceOrderId));

    expect(documents.get('execution_queue')?.[0]).toMatchObject({
      status: 'ABORTED',
      failureReason: 'TIMEOUT',
    });
    expect(documents.get('execution_logs')?.[1]).toMatchObject({
      event: 'execution-aborted',
      reason: 'TIMEOUT',
    });

    const [, routingKey, content] = publish.mock.calls[0] ?? [];

    expect(routingKey).toBe('evt.workshop.execution-aborted');
    expect(JSON.parse(String(content)).data).toMatchObject({ serviceOrderId });
    expect(ack).toHaveBeenCalledTimes(2);
  });

  it('acks an abort over a service order the workshop never received', async () => {
    await startMessaging(channel as never);

    await consumeCallback?.(abortDelivery(crypto.randomUUID()));

    expect(publish).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(nack).not.toHaveBeenCalled();
  });

  it('puts a diagnosed service order into execution', async () => {
    const serviceOrderId = crypto.randomUUID();
    await startMessaging(channel as never);
    await consumeCallback?.(startDiagnosticDelivery(serviceOrderId));
    givenMechanicDiagnosed(serviceOrderId);

    await consumeCallback?.(startExecutionDelivery(serviceOrderId));

    expect(documents.get('execution_queue')?.[0]).toMatchObject({
      status: 'IN_EXECUTION',
      executionItems: [expect.objectContaining({ kind: 'SERVICE' })],
    });
    expect(documents.get('execution_logs')?.[1]).toMatchObject({
      event: 'execution-started',
      status: 'IN_EXECUTION',
    });
    expect(publish).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(2);
  });

  it('does not resurrect an aborted service order', async () => {
    const serviceOrderId = crypto.randomUUID();
    await startMessaging(channel as never);
    await consumeCallback?.(startDiagnosticDelivery(serviceOrderId));
    await consumeCallback?.(abortDelivery(serviceOrderId));

    await consumeCallback?.(startExecutionDelivery(serviceOrderId));

    expect(documents.get('execution_queue')?.[0]).toMatchObject({
      status: 'ABORTED',
    });
    expect(documents.get('execution_logs')).toHaveLength(2);
    expect(ack).toHaveBeenCalledTimes(3);
    expect(nack).not.toHaveBeenCalled();
  });
});
