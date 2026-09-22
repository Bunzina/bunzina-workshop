import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Db } from 'mongodb';
import { startConsumer } from '../messaging/consumer';
import { buildEnvelope } from '../messaging/envelope';
import { ProcessedEventRepository } from './processed-event-repository';

const ack = mock(() => {});
const nack = mock(() => {});

let consumeCallback: ((message: unknown) => Promise<void>) | null = null;

const channel = {
  ack,
  nack,
  bindQueue: mock(async () => ({}) as never),
  consume: mock(async (_queue: string, callback: never) => {
    consumeCallback = callback as unknown as (
      message: unknown,
    ) => Promise<void>;
    return { consumerTag: 'tag' };
  }),
};

const uniqueCollection = () => {
  const keys = new Set<string>();

  return {
    insertOne: async (document: { eventId: string; consumer: string }) => {
      const key = `${document.eventId}:${document.consumer}`;

      if (keys.has(key)) {
        throw Object.assign(new Error('E11000 duplicate key error'), {
          code: 11000,
        });
      }

      keys.add(key);

      return {};
    },
  };
};

const dbWithUniqueIndex = () =>
  ({ collection: () => uniqueCollection() }) as unknown as Db;

const deliveryOf = (envelope: ReturnType<typeof buildEnvelope>) => ({
  content: Buffer.from(JSON.stringify(envelope)),
  properties: { type: envelope.eventType, headers: {} },
});

beforeEach(() => {
  ack.mockClear();
  nack.mockClear();
  consumeCallback = null;
});

describe('the guard of the consumer', () => {
  it('runs the handler once when the same event is delivered twice', async () => {
    const handler = mock(async () => {});
    const repository = new ProcessedEventRepository(
      dbWithUniqueIndex(),
      'bunzina-workshop',
    );
    const envelope = buildEnvelope({
      eventType: 'cmd.workshop.start-diagnostic',
      correlationId: crypto.randomUUID(),
      data: {},
    });

    await startConsumer({
      handlers: { 'cmd.workshop.start-diagnostic': handler },
      isFirstDelivery: repository.isFirstDelivery,
      bindings: ['cmd.workshop.*'],
      channel: channel as never,
    });

    await consumeCallback?.(deliveryOf(envelope));
    await consumeCallback?.(deliveryOf(envelope));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledTimes(2);
    expect(nack).not.toHaveBeenCalled();
  });

  it('runs the handler for each distinct event', async () => {
    const handler = mock(async () => {});
    const repository = new ProcessedEventRepository(
      dbWithUniqueIndex(),
      'bunzina-workshop',
    );
    const anEnvelope = () =>
      buildEnvelope({
        eventType: 'cmd.workshop.start-diagnostic',
        correlationId: crypto.randomUUID(),
        data: {},
      });

    await startConsumer({
      handlers: { 'cmd.workshop.start-diagnostic': handler },
      isFirstDelivery: repository.isFirstDelivery,
      bindings: ['cmd.workshop.*'],
      channel: channel as never,
    });

    await consumeCallback?.(deliveryOf(anEnvelope()));
    await consumeCallback?.(deliveryOf(anEnvelope()));

    expect(handler).toHaveBeenCalledTimes(2);
  });
});
