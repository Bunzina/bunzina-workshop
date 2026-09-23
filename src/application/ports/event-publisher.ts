export interface OutgoingEvent {
  eventType: `evt.workshop.${string}`;
  correlationId: string;
  causationId?: string;
  data: Record<string, unknown>;
}

export interface EventPublisher {
  publish(event: OutgoingEvent): Promise<void>;
}
