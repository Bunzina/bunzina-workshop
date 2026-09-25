import { ExecutionLog } from '@/domain/execution/entities/execution-log';
import { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import type { ExecutionLogRepository } from '@/domain/execution/repositories/execution-log-repository';
import type { ExecutionQueueRepository } from '@/domain/execution/repositories/execution-queue-repository';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import { Vehicle } from '@/domain/execution/value-objects/vehicle';
import { type PricedItemsInput, toExecutionItems } from './execution-items';

export interface StartDiagnosticInput {
  serviceOrderId: string;
  correlationId: string;
  vehicle: { id: string; plate: string; model?: string };
  requestedItems: PricedItemsInput;
  currency: string;
}

export type StartDiagnostic = {
  execute(input: StartDiagnosticInput): Promise<ExecutionQueueItem>;
};

export class StartDiagnosticUseCase implements StartDiagnostic {
  constructor(
    private readonly queueRepository: ExecutionQueueRepository,
    private readonly logRepository: ExecutionLogRepository,
  ) {}

  async execute(input: StartDiagnosticInput): Promise<ExecutionQueueItem> {
    const queued = await this.queueRepository.findByServiceOrderId(
      input.serviceOrderId,
    );

    if (queued) {
      return queued;
    }

    const queueItem = new ExecutionQueueItem({
      serviceOrderId: input.serviceOrderId,
      correlationId: input.correlationId,
      vehicle: new Vehicle(input.vehicle),
      status: ExecutionStatus.IN_DIAGNOSTIC,
      currency: input.currency,
      requestedItems: toExecutionItems(input.requestedItems, input.currency),
    });

    await this.queueRepository.create(queueItem);

    await this.logRepository.append(
      new ExecutionLog({
        serviceOrderId: queueItem.serviceOrderId,
        event: 'diagnostic-started',
        status: queueItem.status,
      }),
    );

    return queueItem;
  }
}
