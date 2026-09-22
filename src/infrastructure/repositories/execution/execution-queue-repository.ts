import type { Collection, Db } from 'mongodb';
import type { ExecutionQueueItem } from '@/domain/execution/entities/execution-queue-item';
import type { ExecutionQueueRepository as ExecutionQueueRepositoryContract } from '@/domain/execution/repositories/execution-queue-repository';
import type { ExecutionStatus } from '@/domain/execution/types/execution-status';
import type { ExecutionQueueDbSchema } from './dtos/execution-queue-db-schema';
import { ExecutionQueueMapper } from './mappers/execution-mapper';

export const EXECUTION_QUEUE_COLLECTION = 'execution_queue';

export class ExecutionQueueRepository implements ExecutionQueueRepositoryContract {
  private readonly collection: Collection<ExecutionQueueDbSchema>;

  constructor(db: Db) {
    this.collection = db.collection<ExecutionQueueDbSchema>(
      EXECUTION_QUEUE_COLLECTION,
    );
  }

  async create(queueItem: ExecutionQueueItem): Promise<ExecutionQueueItem> {
    await this.collection.insertOne(ExecutionQueueMapper.toDatabase(queueItem));

    return queueItem;
  }

  async findByServiceOrderId(
    serviceOrderId: string,
  ): Promise<ExecutionQueueItem | null> {
    const document = await this.collection.findOne({ serviceOrderId });

    return document ? ExecutionQueueMapper.toDomain(document) : null;
  }

  async findByStatus(status: ExecutionStatus): Promise<ExecutionQueueItem[]> {
    const documents = await this.collection.find({ status }).toArray();

    return documents.map(ExecutionQueueMapper.toDomain);
  }

  async update(queueItem: ExecutionQueueItem): Promise<ExecutionQueueItem> {
    queueItem.updatedAt = new Date();

    await this.collection.updateOne(
      { serviceOrderId: queueItem.serviceOrderId },
      { $set: ExecutionQueueMapper.toDatabase(queueItem) },
    );

    return queueItem;
  }
}
