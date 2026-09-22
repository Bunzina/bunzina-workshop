import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Db } from 'mongodb';
import { ProcessedEventRepository } from './processed-event-repository';

const insertOne = mock(async (): Promise<unknown> => ({}));
const collection = mock(() => ({ insertOne }));

const db = { collection } as unknown as Db;

const duplicateKeyError = () =>
  Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });

beforeEach(() => {
  collection.mockClear();
  insertOne.mockClear();
});

describe('ProcessedEventRepository', () => {
  it('works on the processed_events collection', () => {
    new ProcessedEventRepository(db, 'bunzina-workshop');

    expect(collection).toHaveBeenCalledWith('processed_events');
  });

  it('registers the event and takes it as a first delivery', async () => {
    const repository = new ProcessedEventRepository(db, 'bunzina-workshop');

    const isFirst = await repository.isFirstDelivery('event-1');

    expect(isFirst).toBe(true);
    expect(insertOne).toHaveBeenCalledWith({
      eventId: 'event-1',
      consumer: 'bunzina-workshop',
      processedAt: expect.any(Date),
    });
  });

  it('takes a duplicate key as an event it already processed', async () => {
    insertOne.mockImplementationOnce(async () => {
      throw duplicateKeyError();
    });
    const repository = new ProcessedEventRepository(db, 'bunzina-workshop');

    expect(await repository.isFirstDelivery('event-1')).toBe(false);
  });

  it('separates the same event consumed by another consumer', async () => {
    const repository = new ProcessedEventRepository(db, 'other-consumer');

    await repository.isFirstDelivery('event-1');

    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ consumer: 'other-consumer' }),
    );
  });

  it('does not swallow a failure that is not a duplicate key', async () => {
    insertOne.mockImplementationOnce(async () => {
      throw new Error('connection lost');
    });
    const repository = new ProcessedEventRepository(db, 'bunzina-workshop');

    expect(repository.isFirstDelivery('event-1')).rejects.toThrow(
      'connection lost',
    );
  });
});
