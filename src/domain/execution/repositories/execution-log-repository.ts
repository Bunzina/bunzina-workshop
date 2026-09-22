import type { ExecutionLog } from '../entities/execution-log';

export interface ExecutionLogRepository {
  append(log: ExecutionLog): Promise<ExecutionLog>;
  findByServiceOrderId(serviceOrderId: string): Promise<ExecutionLog[]>;
}
