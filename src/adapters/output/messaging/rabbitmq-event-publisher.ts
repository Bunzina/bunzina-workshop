import type { Channel } from 'amqplib';
import type {
  EventPublisher,
  OutgoingEvent,
} from '@/application/ports/event-publisher';
import { buildEnvelope } from '@/infrastructure/messaging/envelope';
import { publish } from '@/infrastructure/messaging/publisher';

export class RabbitMqEventPublisher implements EventPublisher {
  constructor(private readonly channel?: Channel) {}

  async publish(event: OutgoingEvent): Promise<void> {
    await publish(buildEnvelope(event), this.channel);
  }
}
