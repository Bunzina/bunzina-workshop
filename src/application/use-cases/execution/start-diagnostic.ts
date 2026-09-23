import { Money } from '@/domain/core/value-objects/money';
import { ExecutionItem } from '@/domain/execution/entities/execution-item';
import { ExecutionLog } from '@/domain/execution/entities/execution-log';
import { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import type { ExecutionLogRepository } from '@/domain/execution/repositories/execution-log-repository';
import type { ExecutionQueueRepository } from '@/domain/execution/repositories/execution-queue-repository';
import { ExecutionItemKind } from '@/domain/execution/types/execution-item-kind';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import { Vehicle } from '@/domain/execution/value-objects/vehicle';

export interface StartDiagnosticInput {
  serviceOrderId: string;
  vehicle: { id: string; plate: string; model?: string };
  requestedItems: {
    services: {
      serviceId: string;
      description?: string;
      priceCents: number;
    }[];
    autoParts: {
      autoPartId: string;
      description?: string;
      quantity: number;
      unitPriceCents: number;
    }[];
  };
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
      vehicle: new Vehicle(input.vehicle),
      status: ExecutionStatus.IN_DIAGNOSTIC,
      currency: input.currency,
      requestedItems: this.toItems(input),
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

  private toItems(input: StartDiagnosticInput): ExecutionItem[] {
    const services = input.requestedItems.services.map(
      (service) =>
        new ExecutionItem({
          kind: ExecutionItemKind.SERVICE,
          referenceId: service.serviceId,
          description: service.description,
          unitPrice: new Money(service.priceCents, input.currency),
        }),
    );

    const autoParts = input.requestedItems.autoParts.map(
      (autoPart) =>
        new ExecutionItem({
          kind: ExecutionItemKind.AUTO_PART,
          referenceId: autoPart.autoPartId,
          description: autoPart.description,
          quantity: autoPart.quantity,
          unitPrice: new Money(autoPart.unitPriceCents, input.currency),
        }),
    );

    return [...services, ...autoParts];
  }
}
