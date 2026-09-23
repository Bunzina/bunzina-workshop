import { Entity, type EntityProps } from '@/domain/core/entities/entity';
import { InvalidExecutionStatusError } from '../errors/execution-errors';
import type { FailureReason } from '../types/failure-reason';
import { ExecutionStatus, isTerminalStatus } from '../types/execution-status';
import type { Vehicle } from '../value-objects/vehicle';
import type { ExecutionItem } from './execution-item';

export interface ExecutionQueueItemProps extends EntityProps {
  serviceOrderId: string;
  vehicle: Vehicle;
  status?: ExecutionStatus;
  currency?: string;
  requestedItems?: ExecutionItem[];
  diagnosedItems?: ExecutionItem[];
  notes?: string;
  diagnosedBy?: string;
  failureReason?: FailureReason;
  failureDetail?: string;
  enqueuedAt?: Date;
  updatedAt?: Date;
  diagnosedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  abortedAt?: Date;
}

export interface AbortProps {
  reason: FailureReason;
  detail?: string;
}

export class ExecutionQueueItem extends Entity {
  serviceOrderId!: string;
  vehicle!: Vehicle;
  status!: ExecutionStatus;
  currency!: string;
  requestedItems!: ExecutionItem[];
  enqueuedAt!: Date;
  updatedAt!: Date;
  diagnosedItems?: ExecutionItem[];
  notes?: string;
  diagnosedBy?: string;
  failureReason?: FailureReason;
  failureDetail?: string;
  diagnosedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  abortedAt?: Date;

  get isFinished(): boolean {
    return isTerminalStatus(this.status);
  }

  abort({ reason, detail }: AbortProps, at = new Date()): void {
    if (this.isFinished) {
      throw new InvalidExecutionStatusError('abort', this.status);
    }

    this.status = ExecutionStatus.ABORTED;
    this.failureReason = reason;
    this.failureDetail = detail;
    this.abortedAt = at;
  }

  constructor({ id, ...input }: ExecutionQueueItemProps) {
    super(id);

    if (!input.serviceOrderId.trim()) {
      throw new Error('ExecutionQueueItem requires a serviceOrderId');
    }

    input.status = input.status ?? ExecutionStatus.QUEUED;
    input.currency = input.currency ?? 'BRL';
    input.requestedItems = input.requestedItems ?? [];
    input.enqueuedAt = input.enqueuedAt ?? new Date();
    input.updatedAt = input.updatedAt ?? new Date();

    Object.assign(this, input);
  }
}
