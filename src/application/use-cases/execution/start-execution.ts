import { ExecutionLog } from '@/domain/execution/entities/execution-log';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import { ExecutionNotFoundError } from '@/domain/execution/errors/execution-errors';
import type { ExecutionLogRepository } from '@/domain/execution/repositories/execution-log-repository';
import type { ExecutionQueueRepository } from '@/domain/execution/repositories/execution-queue-repository';
import { ExecutionStatus } from '@/domain/execution/types/execution-status';
import {
  type ApprovedItemsInput,
  toApprovedExecutionItems,
} from './execution-items';

export interface StartExecutionInput {
  serviceOrderId: string;
  items: ApprovedItemsInput;
}

export type StartExecution = {
  execute(input: StartExecutionInput): Promise<ExecutionQueueItem>;
};

export class StartExecutionUseCase implements StartExecution {
  constructor(
    private readonly queueRepository: ExecutionQueueRepository,
    private readonly logRepository: ExecutionLogRepository,
  ) {}

  async execute(input: StartExecutionInput): Promise<ExecutionQueueItem> {
    const queueItem = await this.queueRepository.findByServiceOrderId(
      input.serviceOrderId,
    );

    if (!queueItem) {
      throw new ExecutionNotFoundError(input.serviceOrderId);
    }

    if (
      queueItem.isFinished ||
      queueItem.status === ExecutionStatus.IN_EXECUTION
    ) {
      return queueItem;
    }

    queueItem.startExecution({ items: toApprovedExecutionItems(input.items) });

    await this.queueRepository.update(queueItem);

    await this.logRepository.append(
      new ExecutionLog({
        serviceOrderId: queueItem.serviceOrderId,
        event: 'execution-started',
        status: queueItem.status,
      }),
    );

    return queueItem;
  }
}
