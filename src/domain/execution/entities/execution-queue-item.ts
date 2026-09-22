import { Entity, type EntityProps } from '@/domain/core/entities/entity';
import type { FailureReason } from '../types/failure-reason';
import { ExecutionStatus } from '../types/execution-status';
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
