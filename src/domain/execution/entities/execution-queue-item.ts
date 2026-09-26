import { Entity, type EntityProps } from '@/domain/core/entities/entity';
import {
  ExecutionItemAlreadyCompletedError,
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
  failedAt?: Date;
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

export interface FailProps {
  reason: FailureReason;
  detail?: string;
}

export interface FailExecutionProps extends FailProps {
  serviceIds?: string[];
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
  failedAt?: Date;
  abortedAt?: Date;

  get isFinished(): boolean {
    return isTerminalStatus(this.status);
  }

  get canBeAborted(): boolean {
    return (
      this.status !== ExecutionStatus.COMPLETED &&
      this.status !== ExecutionStatus.ABORTED
    );
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

    const services = serviceIds.map((serviceId) => this.findService(serviceId));

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

  get failedServices(): ExecutionItem[] {
    return this.services.filter((service) => service.hasFailed);
  }

  failDiagnostic({ reason, detail }: FailProps, at = new Date()): void {
    if (this.status !== ExecutionStatus.IN_DIAGNOSTIC) {
      throw new InvalidExecutionStatusError(
        'fail the diagnostic of',
        this.status,
      );
    }

    this.markFailed({ reason, detail }, at);
  }

  failExecution(
    { reason, detail, serviceIds = [] }: FailExecutionProps,
    at = new Date(),
  ): void {
    if (this.status !== ExecutionStatus.IN_EXECUTION) {
      throw new InvalidExecutionStatusError(
        'fail the execution of',
        this.status,
      );
    }

    const services = serviceIds.length
      ? serviceIds.map((serviceId) => this.findPendingService(serviceId))
      : this.services.filter((service) => !service.isCompleted);

    for (const service of services) {
      service.fail(at);
    }

    this.markFailed({ reason, detail }, at);
  }

  abort({ reason, detail }: AbortProps, at = new Date()): void {
    if (!this.canBeAborted) {
      throw new InvalidExecutionStatusError('abort', this.status);
    }

    this.status = ExecutionStatus.ABORTED;
    this.failureReason = reason;
    this.failureDetail = detail;
    this.abortedAt = at;
  }

  private markFailed({ reason, detail }: FailProps, at: Date): void {
    this.status = ExecutionStatus.FAILED;
    this.failureReason = reason;
    this.failureDetail = detail;
    this.failedAt = at;
  }

  private findService(serviceId: string): ExecutionItem {
    const service = this.services.find(
      (item) => item.referenceId === serviceId,
    );

    if (!service) {
      throw new ExecutionItemNotFoundError(this.serviceOrderId, serviceId);
    }

    return service;
  }

  private findPendingService(serviceId: string): ExecutionItem {
    const service = this.findService(serviceId);

    if (service.isCompleted) {
      throw new ExecutionItemAlreadyCompletedError(
        this.serviceOrderId,
        serviceId,
      );
    }

    return service;
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
