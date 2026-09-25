import type { StartExecution } from '@/application/use-cases/execution/start-execution';
import type { MessageHandler } from '@/infrastructure/messaging/consumer';
import { startExecutionSchema } from './schemas/start-execution-schema';

export const makeStartExecutionHandler = (
  useCase: StartExecution,
): MessageHandler => {
  return async (envelope) => {
    await useCase.execute(startExecutionSchema.parse(envelope.data));
  };
};
