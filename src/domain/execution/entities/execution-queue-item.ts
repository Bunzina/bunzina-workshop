import { Entity, type EntityProps } from '@/domain/core/entities/entity';
import {
  ExecutionItemNotFoundError,
  InvalidExecutionStatusError,
} from '../errors/execution-errors';
import { ExecutionItemKind } from '../types/execution-item-kind';
import type { FailureReason } from '../types/failure-reason';
import { ExecutionStatus, isTerminalStatus } from '../types/execution-status';
import type { Vehicle } from '../value-objects/vehicle';
import type { ExecutionItem } from './execution-item';

export interface ExecutionQueueItemProps extends EntityProps {
  serviceOrderId: string;
  vehicle: Vehicle;
  correlationId?: string;
  status?: ExecutionStatus;
  currency?: string;
  requestedItems?: ExecutionItem[];
  diagnosedItems?: ExecutionItem[];
  executionItems?: ExecutionItem[];
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

export interface CompleteDiagnosticProps {
  items: ExecutionItem[];
  diagnosedBy: string;
  notes?: string;
}

export interface StartExecutionProps {
  items: ExecutionItem[];
}

export interface CompleteItemsProps {
  serviceIds: string[];
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
  correlationId?: string;
  diagnosedItems?: ExecutionItem[];
  executionItems?: ExecutionItem[];
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

  completeDiagnostic(
    { items, notes, diagnosedBy }: CompleteDiagnosticProps,
    at = new Date(),
  ): void {
    if (this.status !== ExecutionStatus.IN_DIAGNOSTIC) {
      throw new InvalidExecutionStatusError('diagnose', this.status);
    }

    this.status = ExecutionStatus.DIAGNOSED;
    this.diagnosedItems = items;
    this.notes = notes;
    this.diagnosedBy = diagnosedBy;
    this.diagnosedAt = at;
  }

  startExecution({ items }: StartExecutionProps, at = new Date()): void {
    if (this.status !== ExecutionStatus.DIAGNOSED) {
      throw new InvalidExecutionStatusError('start executing', this.status);
    }

    for (const item of items) {
      item.startedAt = at;
    }

    this.status = ExecutionStatus.IN_EXECUTION;
    this.executionItems = items;
    this.startedAt = at;
  }

  get services(): ExecutionItem[] {
    return (this.executionItems ?? []).filter(
      (item) => item.kind === ExecutionItemKind.SERVICE,
    );
  }

  completeItems({ serviceIds }: CompleteItemsProps, at = new Date()): void {
    if (this.status !== ExecutionStatus.IN_EXECUTION) {
      throw new InvalidExecutionStatusError('complete items of', this.status);
    }

    const services = serviceIds.map((serviceId) => {
      const service = this.services.find(
        (item) => item.referenceId === serviceId,
      );

      if (!service) {
        throw new ExecutionItemNotFoundError(this.serviceOrderId, serviceId);
      }

      return service;
    });

    for (const service of services) {
      service.complete(at);
    }

    if (this.services.every((service) => service.isCompleted)) {
      for (const item of this.executionItems ?? []) {
        item.complete(at);
      }

      this.status = ExecutionStatus.COMPLETED;
      this.completedAt = at;
    }
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
