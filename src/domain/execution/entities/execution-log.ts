import { Entity, type EntityProps } from '@/domain/core/entities/entity';
import type { ExecutionStatus } from '../types/execution-status';
import type { FailureReason } from '../types/failure-reason';

export interface ExecutionLogProps extends EntityProps {
  serviceOrderId: string;
  event: string;
  status: ExecutionStatus;
  detail?: string;
  reason?: FailureReason;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export class ExecutionLog extends Entity {
  serviceOrderId!: string;
  event!: string;
  status!: ExecutionStatus;
  occurredAt!: Date;
  detail?: string;
  reason?: FailureReason;
  metadata?: Record<string, unknown>;

  constructor({ id, ...input }: ExecutionLogProps) {
    super(id);

    if (!input.serviceOrderId.trim()) {
      throw new Error('ExecutionLog requires a serviceOrderId');
    }

    input.occurredAt = input.occurredAt ?? new Date();

    Object.assign(this, input);
  }
}
