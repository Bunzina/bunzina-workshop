import { ExecutionLog } from '@/domain/execution/entities/execution-log';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import { ExecutionNotFoundError } from '@/domain/execution/errors/execution-errors';
import type { ExecutionLogRepository } from '@/domain/execution/repositories/execution-log-repository';
import type { ExecutionQueueRepository } from '@/domain/execution/repositories/execution-queue-repository';
import type { FailureReason } from '@/domain/execution/types/failure-reason';
import type { EventPublisher } from '@/application/ports/event-publisher';
import type { ExecutionMetrics } from '@/application/ports/execution-metrics';

export interface FailExecutionInput {
  serviceOrderId: string;
  reason: FailureReason;
  detail?: string;
  serviceIds?: string[];
}

export type FailExecution = {
  execute(input: FailExecutionInput): Promise<ExecutionQueueItem>;
};

export class FailExecutionUseCase implements FailExecution {
  constructor(
    private readonly queueRepository: ExecutionQueueRepository,
    private readonly logRepository: ExecutionLogRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly metrics: ExecutionMetrics,
  ) {}

  async execute(input: FailExecutionInput): Promise<ExecutionQueueItem> {
    const queueItem = await this.queueRepository.findByServiceOrderId(
      input.serviceOrderId,
    );

    if (!queueItem) {
      throw new ExecutionNotFoundError(input.serviceOrderId);
    }

    queueItem.failExecution({
      reason: input.reason,
      detail: input.detail,
      serviceIds: input.serviceIds,
    });

    const failedItems = queueItem.failedServices.map((service) => ({
      serviceId: service.referenceId,
    }));

    await this.queueRepository.update(queueItem);
    this.metrics.executionFinished(queueItem);

    await this.logRepository.append(
      new ExecutionLog({
        serviceOrderId: queueItem.serviceOrderId,
        event: 'execution-failed',
        status: queueItem.status,
        reason: input.reason,
        detail: input.detail,
        metadata: { failedItems },
      }),
    );

    await this.eventPublisher.publish({
      eventType: 'evt.workshop.execution-failed',
      correlationId: queueItem.correlationId ?? queueItem.serviceOrderId,
      data: {
        serviceOrderId: queueItem.serviceOrderId,
        reason: input.reason,
        detail: input.detail,
        failedItems,
      },
    });

    return queueItem;
  }
}
