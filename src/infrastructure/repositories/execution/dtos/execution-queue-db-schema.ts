import type { ExecutionItemKind } from '@/domain/execution/types/execution-item-kind';
import type { ExecutionStatus } from '@/domain/execution/types/execution-status';
import type { FailureReason } from '@/domain/execution/types/failure-reason';

export interface VehicleDbSchema {
  id: string;
  plate: string;
  model?: string;
}

export interface ExecutionItemDbSchema {
  id: string;
  kind: ExecutionItemKind;
  referenceId: string;
  quantity: number;
  isCompleted: boolean;
  description?: string;
  unitPriceCents?: number;
  totalPriceCents?: number;
  startedAt?: Date;
  finishedAt?: Date;
  executionTimeMs?: number;
}

export interface ExecutionQueueDbSchema {
  id: string;
  serviceOrderId: string;
  vehicle: VehicleDbSchema;
  status: ExecutionStatus;
  currency: string;
  requestedItems: ExecutionItemDbSchema[];
  enqueuedAt: Date;
  updatedAt: Date;
  correlationId?: string;
  diagnosedItems?: ExecutionItemDbSchema[];
  notes?: string;
  diagnosedBy?: string;
  failureReason?: FailureReason;
  failureDetail?: string;
  diagnosedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  abortedAt?: Date;
}
