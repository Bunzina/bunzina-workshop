import { Money } from '@/domain/core/value-objects/money';
import { ExecutionItem } from '@/domain/execution/entities/execution-item';
import { ExecutionLog } from '@/domain/execution/entities/execution-log';
import { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import { Vehicle } from '@/domain/execution/value-objects/vehicle';
import type { ExecutionLogDbSchema } from '../dtos/execution-log-db-schema';
import type {
  ExecutionItemDbSchema,
  ExecutionQueueDbSchema,
} from '../dtos/execution-queue-db-schema';

type WithMongoId<TDocument> = TDocument & { _id?: unknown };

const compact = <TValue extends object>(value: TValue): TValue =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as TValue;

const itemToDatabase = (item: ExecutionItem): ExecutionItemDbSchema =>
  compact({
    id: item.id,
    kind: item.kind,
    referenceId: item.referenceId,
    quantity: item.quantity,
    isCompleted: item.isCompleted,
    description: item.description,
    unitPriceCents: item.unitPrice?.amountCents,
    totalPriceCents: item.totalPrice?.amountCents,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
    failedAt: item.failedAt,
    executionTimeMs: item.executionTimeMs,
  });

const itemToDomain = (
  document: ExecutionItemDbSchema,
  currency: string,
): ExecutionItem =>
  new ExecutionItem({
    id: document.id,
    kind: document.kind,
    referenceId: document.referenceId,
    quantity: document.quantity,
    isCompleted: document.isCompleted,
    description: document.description,
    unitPrice:
      document.unitPriceCents === undefined
        ? undefined
        : new Money(document.unitPriceCents, currency),
    totalPrice:
      document.totalPriceCents === undefined
        ? undefined
        : new Money(document.totalPriceCents, currency),
    startedAt: document.startedAt,
    finishedAt: document.finishedAt,
    failedAt: document.failedAt,
    executionTimeMs: document.executionTimeMs,
  });

export const ExecutionQueueMapper = {
  toDatabase(queueItem: ExecutionQueueItem): ExecutionQueueDbSchema {
    return compact({
      id: queueItem.id,
      serviceOrderId: queueItem.serviceOrderId,
      vehicle: compact({
        id: queueItem.vehicle.id,
        plate: queueItem.vehicle.plate,
        model: queueItem.vehicle.model,
      }),
      status: queueItem.status,
      currency: queueItem.currency,
      requestedItems: queueItem.requestedItems.map(itemToDatabase),
      enqueuedAt: queueItem.enqueuedAt,
      updatedAt: queueItem.updatedAt,
      correlationId: queueItem.correlationId,
      diagnosedItems: queueItem.diagnosedItems?.map(itemToDatabase),
      executionItems: queueItem.executionItems?.map(itemToDatabase),
      notes: queueItem.notes,
      diagnosedBy: queueItem.diagnosedBy,
      failureReason: queueItem.failureReason,
      failureDetail: queueItem.failureDetail,
      diagnosedAt: queueItem.diagnosedAt,
      startedAt: queueItem.startedAt,
      completedAt: queueItem.completedAt,
      failedAt: queueItem.failedAt,
      abortedAt: queueItem.abortedAt,
    });
  },

  toDomain(document: WithMongoId<ExecutionQueueDbSchema>): ExecutionQueueItem {
    return new ExecutionQueueItem({
      id: document.id,
      serviceOrderId: document.serviceOrderId,
      vehicle: new Vehicle(document.vehicle),
      correlationId: document.correlationId,
      status: document.status,
      currency: document.currency,
      requestedItems: document.requestedItems.map((item) =>
        itemToDomain(item, document.currency),
      ),
      diagnosedItems: document.diagnosedItems?.map((item) =>
        itemToDomain(item, document.currency),
      ),
      executionItems: document.executionItems?.map((item) =>
        itemToDomain(item, document.currency),
      ),
      notes: document.notes,
      diagnosedBy: document.diagnosedBy,
      failureReason: document.failureReason,
      failureDetail: document.failureDetail,
      enqueuedAt: document.enqueuedAt,
      updatedAt: document.updatedAt,
      diagnosedAt: document.diagnosedAt,
      startedAt: document.startedAt,
      completedAt: document.completedAt,
      failedAt: document.failedAt,
      abortedAt: document.abortedAt,
    });
  },
};

export const ExecutionLogMapper = {
  toDatabase(log: ExecutionLog): ExecutionLogDbSchema {
    return compact({
      id: log.id,
      serviceOrderId: log.serviceOrderId,
      event: log.event,
      status: log.status,
      occurredAt: log.occurredAt,
      detail: log.detail,
      reason: log.reason,
      metadata: log.metadata,
    });
  },

  toDomain(document: WithMongoId<ExecutionLogDbSchema>): ExecutionLog {
    return new ExecutionLog({
      id: document.id,
      serviceOrderId: document.serviceOrderId,
      event: document.event,
      status: document.status,
      occurredAt: document.occurredAt,
      detail: document.detail,
      reason: document.reason,
      metadata: document.metadata,
    });
  },
};
