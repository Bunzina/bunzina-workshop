import { ExecutionLog } from '@/domain/execution/entities/execution-log';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import { ExecutionNotFoundError } from '@/domain/execution/errors/execution-errors';
import type { ExecutionLogRepository } from '@/domain/execution/repositories/execution-log-repository';
import type { ExecutionQueueRepository } from '@/domain/execution/repositories/execution-queue-repository';
import type { FailureReason } from '@/domain/execution/types/failure-reason';
import type { EventPublisher } from '@/application/ports/event-publisher';
import type { ExecutionMetrics } from '@/application/ports/execution-metrics';

export interface FailDiagnosticInput {
  serviceOrderId: string;
  reason: FailureReason;
  detail?: string;
}

export type FailDiagnostic = {
  execute(input: FailDiagnosticInput): Promise<ExecutionQueueItem>;
};

export class FailDiagnosticUseCase implements FailDiagnostic {
  constructor(
    private readonly queueRepository: ExecutionQueueRepository,
    private readonly logRepository: ExecutionLogRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly metrics: ExecutionMetrics,
  ) {}

  async execute(input: FailDiagnosticInput): Promise<ExecutionQueueItem> {
    const queueItem = await this.queueRepository.findByServiceOrderId(
      input.serviceOrderId,
    );

    if (!queueItem) {
      throw new ExecutionNotFoundError(input.serviceOrderId);
    }

    queueItem.failDiagnostic({ reason: input.reason, detail: input.detail });

    await this.queueRepository.update(queueItem);
    this.metrics.diagnosticFinished(queueItem);

    await this.logRepository.append(
      new ExecutionLog({
        serviceOrderId: queueItem.serviceOrderId,
        event: 'diagnostic-failed',
        status: queueItem.status,
        reason: input.reason,
        detail: input.detail,
      }),
    );

    await this.eventPublisher.publish({
      eventType: 'evt.workshop.diagnostic-failed',
      correlationId: queueItem.correlationId ?? queueItem.serviceOrderId,
      data: {
        serviceOrderId: queueItem.serviceOrderId,
        reason: input.reason,
        detail: input.detail,
      },
    });

    return queueItem;
  }
}
