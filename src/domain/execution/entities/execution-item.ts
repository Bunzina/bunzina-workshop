import { Entity, type EntityProps } from '@/domain/core/entities/entity';
import type { Money } from '@/domain/core/value-objects/money';
import type { ExecutionItemKind } from '../types/execution-item-kind';

export interface ExecutionItemProps extends EntityProps {
  kind: ExecutionItemKind;
  referenceId: string;
  description?: string;
  quantity?: number;
  unitPrice?: Money;
  totalPrice?: Money;
  isCompleted?: boolean;
  startedAt?: Date;
  finishedAt?: Date;
  executionTimeMs?: number;
}

export class ExecutionItem extends Entity {
  kind!: ExecutionItemKind;
  referenceId!: string;
  quantity!: number;
  isCompleted!: boolean;
  description?: string;
  unitPrice?: Money;
  totalPrice?: Money;
  startedAt?: Date;
  finishedAt?: Date;
  executionTimeMs?: number;

  complete(at = new Date()): void {
    if (this.isCompleted) {
      return;
    }

    this.isCompleted = true;
    this.finishedAt = at;
    this.executionTimeMs = this.startedAt
      ? at.getTime() - this.startedAt.getTime()
      : undefined;
  }

  constructor({ id, ...input }: ExecutionItemProps) {
    super(id);

    if (!input.referenceId.trim()) {
      throw new Error('ExecutionItem requires a referenceId');
    }

    input.quantity = input.quantity ?? 1;

    if (input.quantity < 1) {
      throw new Error('Quantity cannot be zero or negative');
    }

    input.isCompleted = input.isCompleted ?? false;
    input.totalPrice =
      input.totalPrice ?? input.unitPrice?.times(input.quantity);

    Object.assign(this, input);
  }
}
