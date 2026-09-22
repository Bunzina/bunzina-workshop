import { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import type { ExecutionQueueItemProps } from '@/domain/execution/entities/execution-queue-item';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import { Vehicle } from '@/domain/execution/value-objects/vehicle';
import { makeExecutionItem } from './make-execution-item';

export const makeExecutionQueueItem = (
  override?: Partial<ExecutionQueueItemProps>,
): ExecutionQueueItem =>
  new ExecutionQueueItem({
    id: 'queue-item-id',
    serviceOrderId: 'service-order-id',
    vehicle: new Vehicle({
      id: 'vehicle-id',
      plate: 'ABC1D23',
      model: 'Gol 1.6',
    }),
    status: ExecutionStatus.IN_DIAGNOSTIC,
    requestedItems: [makeExecutionItem()],
    enqueuedAt: new Date('2026-09-17T16:00:00.000Z'),
    updatedAt: new Date('2026-09-17T16:00:00.000Z'),
    ...override,
  });
