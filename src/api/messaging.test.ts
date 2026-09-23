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
  findOne: async () => null,
  find: () => ({
    sort: () => ({ toArray: async () => [] }),
    toArray: async () => [],
  }),
  updateOne: async () => ({}),
});

const getDb = mock(
  async () => ({ collection: collectionFor }) as unknown as Db,
);

mock.module('@/infrastructure/configs/mongo', () => ({ getDb }));

const ack = mock(() => {});
const nack = mock(() => {});
const bindQueue = mock(async () => ({}) as never);

let consumeCallback: ((message: unknown) => Promise<void>) | null = null;

const channel = {
  ack,
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

const startDiagnosticDelivery = () => {
  const envelope = buildEnvelope({
    eventType: 'cmd.workshop.start-diagnostic',
    correlationId: crypto.randomUUID(),
    data: {
      serviceOrderId: crypto.randomUUID(),
      vehicle: { id: crypto.randomUUID(), plate: 'ABC1D23', model: 'Gol 1.6' },
      requestedItems: {
        services: [{ serviceId: crypto.randomUUID(), priceCents: 38000 }],
        autoParts: [],
      },
      currency: 'BRL',
    },
  });

  return {
    content: Buffer.from(JSON.stringify(envelope)),
    properties: { type: envelope.eventType, headers: {} },
  };
};

beforeEach(() => {
  documents.clear();
  ack.mockClear();
  nack.mockClear();
  bindQueue.mockClear();
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
});
