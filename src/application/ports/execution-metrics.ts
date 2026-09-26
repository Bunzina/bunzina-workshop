import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';

export interface ExecutionMetrics {
  diagnosticFinished(queueItem: ExecutionQueueItem): void;
  executionFinished(queueItem: ExecutionQueueItem): void;
  aborted(queueItem: ExecutionQueueItem): void;
}
