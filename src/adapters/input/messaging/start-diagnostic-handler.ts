import type { StartDiagnostic } from '@/application/use-cases/execution/start-diagnostic';
import type { MessageHandler } from '@/infrastructure/messaging/consumer';
import { startDiagnosticSchema } from './schemas/start-diagnostic-schema';

export const makeStartDiagnosticHandler = (
  useCase: StartDiagnostic,
): MessageHandler => {
  return async (envelope) => {
    await useCase.execute({
      ...startDiagnosticSchema.parse(envelope.data),
      correlationId: envelope.correlationId,
    });
  };
};
