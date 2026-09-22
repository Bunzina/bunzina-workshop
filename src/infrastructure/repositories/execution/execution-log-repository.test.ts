import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Db } from 'mongodb';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import { makeExecutionLog } from '@/test/factories/make-execution-log';
import { ExecutionLogMapper } from './mappers/execution-mapper';
import { ExecutionLogRepository } from './execution-log-repository';

const insertOne = mock(async () => ({}));
const toArray = mock(async (): Promise<unknown[]> => []);
const sort = mock(() => ({ toArray }));
const find = mock(() => ({ sort }));
const collection = mock(() => ({ insertOne, find }));

const db = { collection } as unknown as Db;

const makeRepository = () => new ExecutionLogRepository(db);

beforeEach(() => {
  collection.mockClear();
  insertOne.mockClear();
  find.mockClear();
  sort.mockClear();
  toArray.mockClear();
});

describe('ExecutionLogRepository', () => {
  it('works on the execution_logs collection', () => {
    makeRepository();

    expect(collection).toHaveBeenCalledWith('execution_logs');
  });

  it('appends the log it is given', async () => {
    const log = makeExecutionLog();

    const appended = await makeRepository().append(log);

    expect(insertOne).toHaveBeenCalledWith(ExecutionLogMapper.toDatabase(log));
    expect(appended).toBe(log);
  });

  it('reads the history of a service order in the order it happened', async () => {
    toArray.mockResolvedValueOnce([
      ExecutionLogMapper.toDatabase(makeExecutionLog()),
      ExecutionLogMapper.toDatabase(
        makeExecutionLog({
          id: 'later-log-id',
          event: 'execution-started',
          status: ExecutionStatus.IN_EXECUTION,
          occurredAt: new Date('2026-09-17T17:00:00.000Z'),
        }),
      ),
    ]);

    const history =
      await makeRepository().findByServiceOrderId('service-order-id');

    expect(find).toHaveBeenCalledWith({ serviceOrderId: 'service-order-id' });
    expect(sort).toHaveBeenCalledWith({ occurredAt: 1 });
    expect(history.map((log) => log.event)).toEqual([
      'diagnostic-started',
      'execution-started',
    ]);
  });

  it('answers an empty history when nothing was logged yet', async () => {
    expect(
      await makeRepository().findByServiceOrderId('unknown-order'),
    ).toEqual([]);
  });
});
