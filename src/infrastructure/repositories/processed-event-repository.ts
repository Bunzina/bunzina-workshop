import type { Collection, Db } from 'mongodb';
import type { IdempotencyGuard } from '../messaging/consumer';

export const PROCESSED_EVENTS_COLLECTION = 'processed_events';

const DUPLICATE_KEY = 11000;

export interface ProcessedEventDbSchema {
  eventId: string;
  consumer: string;
  processedAt: Date;
}

const isDuplicateKey = (error: unknown): boolean =>
  (error as { code?: number })?.code === DUPLICATE_KEY;

export class ProcessedEventRepository {
  private readonly collection: Collection<ProcessedEventDbSchema>;

  constructor(
    db: Db,
    private readonly consumer: string,
  ) {
    this.collection = db.collection<ProcessedEventDbSchema>(
      PROCESSED_EVENTS_COLLECTION,
    );
  }

  isFirstDelivery: IdempotencyGuard = async (eventId) => {
    try {
      await this.collection.insertOne({
        eventId,
        consumer: this.consumer,
        processedAt: new Date(),
      });

      return true;
    } catch (error) {
      if (isDuplicateKey(error)) {
        return false;
      }

      throw error;
    }
  };
}
