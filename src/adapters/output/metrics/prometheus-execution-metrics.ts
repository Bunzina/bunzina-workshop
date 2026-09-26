import type { ExecutionMetrics } from '@/application/ports/execution-metrics';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import {
  diagnosticDurationSeconds,
  executionDurationSeconds,
  executionsAbortedTotal,
} from '@/infrastructure/observability/metrics';

const outcomeOf = (queueItem: ExecutionQueueItem) =>
  queueItem.status === ExecutionStatus.FAILED ? 'failed' : 'completed';

const secondsBetween = (start?: Date, end?: Date): number | undefined =>
  start && end ? (end.getTime() - start.getTime()) / 1000 : undefined;

export class PrometheusExecutionMetrics implements ExecutionMetrics {
  diagnosticFinished(queueItem: ExecutionQueueItem): void {
    const seconds = secondsBetween(
      queueItem.enqueuedAt,
      queueItem.diagnosedAt ?? queueItem.failedAt,
    );

    if (seconds !== undefined) {
      diagnosticDurationSeconds.observe(
        { outcome: outcomeOf(queueItem) },
        seconds,
      );
    }
  }

  executionFinished(queueItem: ExecutionQueueItem): void {
    const seconds = secondsBetween(
      queueItem.startedAt,
      queueItem.completedAt ?? queueItem.failedAt,
    );

    if (seconds !== undefined) {
      executionDurationSeconds.observe(
        { outcome: outcomeOf(queueItem) },
        seconds,
      );
    }
  }

  aborted(queueItem: ExecutionQueueItem): void {
    executionsAbortedTotal.inc({
      reason: queueItem.failureReason ?? 'UNKNOWN',
    });
  }
}
