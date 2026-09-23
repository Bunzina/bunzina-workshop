import { describe, expect, it, mock } from 'bun:test';
import type { Channel } from 'amqplib';
import { EXCHANGE } from '@/infrastructure/messaging/connection';
import { envelopeSchema } from '@/infrastructure/messaging/envelope';
import { RabbitMqEventPublisher } from './rabbitmq-event-publisher';

const fakeChannel = () => {
  const publish = mock(
    (_exchange: string, _routingKey: string, _content: Buffer) => true,
  );
  return { channel: { publish } as unknown as Channel, publish };
};

describe('RabbitMqEventPublisher', () => {
  it('publishes the event wrapped in a valid envelope', async () => {
    const { channel, publish } = fakeChannel();
    const correlationId = crypto.randomUUID();
    const causationId = crypto.randomUUID();

    await new RabbitMqEventPublisher(channel).publish({
      eventType: 'evt.workshop.execution-aborted',
      correlationId,
      causationId,
      data: { serviceOrderId: 'service-order-id' },
    });

    const [exchange, routingKey, content] = publish.mock.calls[0] ?? [];
    const envelope = envelopeSchema.parse(JSON.parse(String(content)));

    expect(exchange).toBe(EXCHANGE);
    expect(routingKey).toBe('evt.workshop.execution-aborted');
    expect(envelope).toMatchObject({
      eventType: 'evt.workshop.execution-aborted',
      correlationId,
      causationId,
      producer: 'bunzina-workshop',
      data: { serviceOrderId: 'service-order-id' },
    });
  });
});
