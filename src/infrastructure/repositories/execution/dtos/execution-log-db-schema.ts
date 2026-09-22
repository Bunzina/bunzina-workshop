import type { ExecutionStatus } from '@/domain/execution/types/execution-status';
import type { FailureReason } from '@/domain/execution/types/failure-reason';

export interface ExecutionLogDbSchema {
  id: string;
  serviceOrderId: string;
  event: string;
  status: ExecutionStatus;
  occurredAt: Date;
  detail?: string;
  reason?: FailureReason;
  metadata?: Record<string, unknown>;
}
