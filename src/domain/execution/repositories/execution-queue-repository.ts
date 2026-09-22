import type { ExecutionQueueItem } from '../entities/execution-queue-item';
import type { ExecutionStatus } from '../types/execution-status';

export interface ExecutionQueueRepository {
  create(queueItem: ExecutionQueueItem): Promise<ExecutionQueueItem>;
  findByServiceOrderId(
    serviceOrderId: string,
  ): Promise<ExecutionQueueItem | null>;
  findByStatus(status: ExecutionStatus): Promise<ExecutionQueueItem[]>;
  update(queueItem: ExecutionQueueItem): Promise<ExecutionQueueItem>;
}
