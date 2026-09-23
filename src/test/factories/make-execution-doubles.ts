import { mock } from 'bun:test';
import type {
  EventPublisher,
  OutgoingEvent,
} from '@/application/ports/event-publisher';
import type { ExecutionLog } from '@/domain/execution/entities/execution-log';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import type { ExecutionLogRepository } from '@/domain/execution/repositories/execution-log-repository';
import type { ExecutionQueueRepository } from '@/domain/execution/repositories/execution-queue-repository';

export const makeQueueRepository = () =>
  ({
    create: mock(async (queueItem: ExecutionQueueItem) => queueItem),
    findByServiceOrderId: mock(
      async (_serviceOrderId: string): Promise<ExecutionQueueItem | null> =>
        null,
    ),
    findByStatus: mock(async (): Promise<ExecutionQueueItem[]> => []),
    update: mock(async (queueItem: ExecutionQueueItem) => queueItem),
  }) satisfies ExecutionQueueRepository;

export const makeLogRepository = () =>
  ({
    append: mock(async (log: ExecutionLog) => log),
    findByServiceOrderId: mock(async (): Promise<ExecutionLog[]> => []),
  }) satisfies ExecutionLogRepository;

export const makeEventPublisher = () =>
  ({
    publish: mock(async (_event: OutgoingEvent) => {}),
  }) satisfies EventPublisher;
