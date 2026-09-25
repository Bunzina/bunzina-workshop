import { ExecutionLog } from '@/domain/execution/entities/execution-log';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import { ExecutionNotFoundError } from '@/domain/execution/errors/execution-errors';
import type { ExecutionLogRepository } from '@/domain/execution/repositories/execution-log-repository';
import type { ExecutionQueueRepository } from '@/domain/execution/repositories/execution-queue-repository';
import type { EventPublisher } from '@/application/ports/event-publisher';
import {
  type PricedItemsInput,
  toExecutionItems,
  toPricedItems,
} from './execution-items';

export interface CompleteDiagnosticInput {
  serviceOrderId: string;
  diagnosedItems: PricedItemsInput;
  diagnosedBy: string;
  notes?: string;
}

export type CompleteDiagnostic = {
  execute(input: CompleteDiagnosticInput): Promise<ExecutionQueueItem>;
};

export class CompleteDiagnosticUseCase implements CompleteDiagnostic {
  constructor(
    private readonly queueRepository: ExecutionQueueRepository,
    private readonly logRepository: ExecutionLogRepository,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: CompleteDiagnosticInput): Promise<ExecutionQueueItem> {
    const queueItem = await this.queueRepository.findByServiceOrderId(
      input.serviceOrderId,
    );

    if (!queueItem) {
      throw new ExecutionNotFoundError(input.serviceOrderId);
    }

    queueItem.completeDiagnostic({
      items: toExecutionItems(input.diagnosedItems, queueItem.currency),
      notes: input.notes,
      diagnosedBy: input.diagnosedBy,
    });

    await this.queueRepository.update(queueItem);

    await this.logRepository.append(
      new ExecutionLog({
        serviceOrderId: queueItem.serviceOrderId,
        event: 'diagnostic-completed',
        status: queueItem.status,
        detail: input.notes,
        metadata: { diagnosedBy: input.diagnosedBy },
      }),
    );

    await this.eventPublisher.publish({
      eventType: 'evt.workshop.diagnostic-completed',
      correlationId: queueItem.correlationId ?? queueItem.serviceOrderId,
      data: {
        serviceOrderId: queueItem.serviceOrderId,
        diagnosedItems: toPricedItems(queueItem.diagnosedItems ?? []),
        notes: queueItem.notes,
        diagnosedBy: queueItem.diagnosedBy,
        currency: queueItem.currency,
      },
    });

    return queueItem;
  }
}
