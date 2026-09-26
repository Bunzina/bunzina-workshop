import { mock } from 'bun:test';
import type {
  EventPublisher,
  OutgoingEvent,
} from '@/application/ports/event-publisher';
import type { ExecutionMetrics } from '@/application/ports/execution-metrics';
import type { ExecutionLog } from '@/domain/execution/entities/execution-log';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import type { ExecutionLogRepository } from '@/domain/execution/repositories/execution-log-repository';
import type { ExecutionQueueRepository } from '@/domain/execution/repositories/execution-queue-repository';
import type { ExecutionStatus } from '@/domain/execution/types/execution-status';

export const makeQueueRepository = () =>
  ({
    create: mock(async (queueItem: ExecutionQueueItem) => queueItem),
    findByServiceOrderId: mock(
      async (_serviceOrderId: string): Promise<ExecutionQueueItem | null> =>
        null,
    ),
    findByStatus: mock(async (): Promise<ExecutionQueueItem[]> => []),
    update: mock(async (queueItem: ExecutionQueueItem) => queueItem),
    countByStatus: mock(
      async (): Promise<Partial<Record<ExecutionStatus, number>>> => ({}),
    ),
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

export const makeExecutionMetrics = () =>
  ({
    diagnosticFinished: mock((_queueItem: ExecutionQueueItem) => {}),
    executionFinished: mock((_queueItem: ExecutionQueueItem) => {}),
    aborted: mock((_queueItem: ExecutionQueueItem) => {}),
  }) satisfies ExecutionMetrics;
