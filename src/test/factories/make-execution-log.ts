import { ExecutionLog } from '@/domain/execution/entities/execution-log';
import type { ExecutionLogProps } from '@/domain/execution/entities/execution-log';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';

export const makeExecutionLog = (
  override?: Partial<ExecutionLogProps>,
): ExecutionLog =>
  new ExecutionLog({
    id: 'log-id',
    serviceOrderId: 'service-order-id',
    event: 'diagnostic-started',
    status: ExecutionStatus.IN_DIAGNOSTIC,
    occurredAt: new Date('2026-09-17T16:00:00.000Z'),
    ...override,
  });
