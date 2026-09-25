import { ExecutionLog } from '@/domain/execution/entities/execution-log';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import type { ExecutionLogRepository } from '@/domain/execution/repositories/execution-log-repository';
import type { ExecutionQueueRepository } from '@/domain/execution/repositories/execution-queue-repository';
import type { FailureReason } from '@/domain/execution/types/failure-reason';
import type { EventPublisher } from '@/application/ports/event-publisher';

export interface AbortExecutionInput {
  serviceOrderId: string;
  reason: FailureReason;
  detail?: string;
  correlationId: string;
  causationId?: string;
}

export type AbortExecution = {
  execute(input: AbortExecutionInput): Promise<ExecutionQueueItem | null>;
};

export class AbortExecutionUseCase implements AbortExecution {
  constructor(
    private readonly queueRepository: ExecutionQueueRepository,
    private readonly logRepository: ExecutionLogRepository,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(
    input: AbortExecutionInput,
  ): Promise<ExecutionQueueItem | null> {
    const queueItem = await this.queueRepository.findByServiceOrderId(
      input.serviceOrderId,
    );

    if (!queueItem || queueItem.isFinished) {
      return queueItem;
    }

    const previousStatus = queueItem.status;

    queueItem.abort({ reason: input.reason, detail: input.detail });

    await this.queueRepository.update(queueItem);

    await this.logRepository.append(
      new ExecutionLog({
        serviceOrderId: queueItem.serviceOrderId,
        event: 'execution-aborted',
        status: queueItem.status,
        reason: input.reason,
        detail: input.detail,
        metadata: { previousStatus },
      }),
    );

    await this.eventPublisher.publish({
      eventType: 'evt.workshop.execution-aborted',
      correlationId: input.correlationId,
      causationId: input.causationId,
      data: {
        serviceOrderId: queueItem.serviceOrderId,
        abortedAt: queueItem.abortedAt?.toISOString(),
      },
    });

    return queueItem;
  }
}
