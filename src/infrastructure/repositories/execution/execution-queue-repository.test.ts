import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Db } from 'mongodb';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import { makeExecutionQueueItem } from '@/test/factories/make-execution-queue-item';
import { ExecutionQueueMapper } from './mappers/execution-mapper';
import { ExecutionQueueRepository } from './execution-queue-repository';

const insertOne = mock(async () => ({}));
const findOne = mock(async (): Promise<unknown> => null);
const toArray = mock(async (): Promise<unknown[]> => []);
const find = mock(() => ({ toArray }));
const updateOne = mock(async () => ({}));
const collection = mock(() => ({ insertOne, findOne, find, updateOne }));

const db = { collection } as unknown as Db;

const makeRepository = () => new ExecutionQueueRepository(db);

beforeEach(() => {
  collection.mockClear();
  insertOne.mockClear();
  findOne.mockClear();
  find.mockClear();
  toArray.mockClear();
  updateOne.mockClear();
});

describe('ExecutionQueueRepository', () => {
  it('works on the execution_queue collection', () => {
    makeRepository();

    expect(collection).toHaveBeenCalledWith('execution_queue');
  });

  it('inserts the document of the queue item it creates', async () => {
    const queueItem = makeExecutionQueueItem();

    const created = await makeRepository().create(queueItem);

    expect(insertOne).toHaveBeenCalledWith(
      ExecutionQueueMapper.toDatabase(queueItem),
    );
    expect(created).toBe(queueItem);
  });

  it('finds the queue item of a service order', async () => {
    const queueItem = makeExecutionQueueItem();
    findOne.mockResolvedValueOnce({
      _id: 'mongo-object-id',
      ...ExecutionQueueMapper.toDatabase(queueItem),
    });

    const found =
      await makeRepository().findByServiceOrderId('service-order-id');

    expect(findOne).toHaveBeenCalledWith({
      serviceOrderId: 'service-order-id',
    });
    expect(found).toEqual(queueItem);
  });

  it('answers null when the service order has no queue item', async () => {
    expect(
      await makeRepository().findByServiceOrderId('unknown-order'),
    ).toBeNull();
  });

  it('finds every queue item in a status', async () => {
    toArray.mockResolvedValueOnce([
      ExecutionQueueMapper.toDatabase(makeExecutionQueueItem()),
      ExecutionQueueMapper.toDatabase(
        makeExecutionQueueItem({ serviceOrderId: 'other-order' }),
      ),
    ]);

    const found = await makeRepository().findByStatus(
      ExecutionStatus.IN_DIAGNOSTIC,
    );

    expect(find).toHaveBeenCalledWith({
      status: ExecutionStatus.IN_DIAGNOSTIC,
    });
    expect(found.map((item) => item.serviceOrderId)).toEqual([
      'service-order-id',
      'other-order',
    ]);
  });

  it('updates the document of the service order it belongs to', async () => {
    const queueItem = makeExecutionQueueItem();

    const updated = await makeRepository().update(queueItem);

    expect(updateOne).toHaveBeenCalledWith(
      { serviceOrderId: 'service-order-id' },
      { $set: ExecutionQueueMapper.toDatabase(queueItem) },
    );
    expect(updated).toBe(queueItem);
  });

  it('stamps the moment of the update', async () => {
    const queueItem = makeExecutionQueueItem({
      updatedAt: new Date('2026-09-17T16:00:00.000Z'),
    });

    const updated = await makeRepository().update(queueItem);

    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      new Date('2026-09-17T16:00:00.000Z').getTime(),
    );
  });
});
