import type { Collection, Db } from 'mongodb';
import type { ExecutionLog } from '@/domain/execution/entities/execution-log';
import type { ExecutionLogRepository as ExecutionLogRepositoryContract } from '@/domain/execution/repositories/execution-log-repository';
import type { ExecutionLogDbSchema } from './dtos/execution-log-db-schema';
import { ExecutionLogMapper } from './mappers/execution-mapper';

export const EXECUTION_LOGS_COLLECTION = 'execution_logs';

export class ExecutionLogRepository implements ExecutionLogRepositoryContract {
  private readonly collection: Collection<ExecutionLogDbSchema>;

  constructor(db: Db) {
    this.collection = db.collection<ExecutionLogDbSchema>(
      EXECUTION_LOGS_COLLECTION,
    );
  }

  async append(log: ExecutionLog): Promise<ExecutionLog> {
    await this.collection.insertOne(ExecutionLogMapper.toDatabase(log));

    return log;
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<ExecutionLog[]> {
    const documents = await this.collection
      .find({ serviceOrderId })
      .sort({ occurredAt: 1 })
      .toArray();

    return documents.map(ExecutionLogMapper.toDomain);
  }
}
