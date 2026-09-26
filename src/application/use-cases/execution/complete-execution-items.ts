import { ExecutionLog } from '@/domain/execution/entities/execution-log';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import { ExecutionNotFoundError } from '@/domain/execution/errors/execution-errors';
import type { ExecutionLogRepository } from '@/domain/execution/repositories/execution-log-repository';
import type { ExecutionQueueRepository } from '@/domain/execution/repositories/execution-queue-repository';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import type { EventPublisher } from '@/application/ports/event-publisher';
import type { ExecutionMetrics } from '@/application/ports/execution-metrics';

export interface CompleteExecutionItemsInput {
  serviceOrderId: string;
  serviceIds: string[];
}

export type CompleteExecutionItems = {
  execute(input: CompleteExecutionItemsInput): Promise<ExecutionQueueItem>;
};

export class CompleteExecutionItemsUseCase implements CompleteExecutionItems {
  constructor(
    private readonly queueRepository: ExecutionQueueRepository,
    private readonly logRepository: ExecutionLogRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly metrics: ExecutionMetrics,
  ) {}

  async execute(
    input: CompleteExecutionItemsInput,
  ): Promise<ExecutionQueueItem> {
    const queueItem = await this.queueRepository.findByServiceOrderId(
      input.serviceOrderId,
    );

    if (!queueItem) {
      throw new ExecutionNotFoundError(input.serviceOrderId);
    }

    queueItem.completeItems({ serviceIds: input.serviceIds });

    await this.queueRepository.update(queueItem);

    await this.logRepository.append(
      new ExecutionLog({
        serviceOrderId: queueItem.serviceOrderId,
        event: 'execution-items-completed',
        status: queueItem.status,
        metadata: { serviceIds: input.serviceIds },
      }),
    );

    if (queueItem.status === ExecutionStatus.COMPLETED) {
      this.metrics.executionFinished(queueItem);
      await this.publishCompletion(queueItem);
    }

    return queueItem;
  }

  private async publishCompletion(queueItem: ExecutionQueueItem) {
    await this.logRepository.append(
      new ExecutionLog({
        serviceOrderId: queueItem.serviceOrderId,
        event: 'execution-completed',
        status: queueItem.status,
      }),
    );

    await this.eventPublisher.publish({
      eventType: 'evt.workshop.execution-completed',
      correlationId: queueItem.correlationId ?? queueItem.serviceOrderId,
      data: {
        serviceOrderId: queueItem.serviceOrderId,
        completedItems: queueItem.services.map((service) => ({
          serviceId: service.referenceId,
          finishedAt: service.finishedAt?.toISOString(),
          executionTimeMs: service.executionTimeMs,
        })),
        completedAt: queueItem.completedAt?.toISOString(),
      },
    });
  }
}
