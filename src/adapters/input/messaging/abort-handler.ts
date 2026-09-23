import type { AbortExecution } from '@/application/use-cases/execution/abort-execution';
import type { MessageHandler } from '@/infrastructure/messaging/consumer';
import { abortSchema } from './schemas/abort-schema';

export const makeAbortHandler = (useCase: AbortExecution): MessageHandler => {
  return async (envelope) => {
    await useCase.execute({
      ...abortSchema.parse(envelope.data),
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
    });
  };
};
