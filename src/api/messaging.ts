import type { Channel } from 'amqplib';
import { makeStartDiagnosticHandler } from '@/adapters/input/messaging/start-diagnostic-handler';
import { StartDiagnosticUseCase } from '@/application/use-cases/execution/start-diagnostic';
import { getDb } from '@/infrastructure/configs/mongo';
import { startConsumer } from '@/infrastructure/messaging/consumer';
import { ExecutionLogRepository } from '@/infrastructure/repositories/execution/execution-log-repository';
import { ExecutionQueueRepository } from '@/infrastructure/repositories/execution/execution-queue-repository';
import { ProcessedEventRepository } from '@/infrastructure/repositories/processed-event-repository';

const CONSUMER = process.env.OTEL_SERVICE_NAME || 'bunzina-workshop';

export const startMessaging = async (channel?: Channel): Promise<void> => {
  const db = await getDb();

  const queueRepository = new ExecutionQueueRepository(db);
  const logRepository = new ExecutionLogRepository(db);
  const processedEvents = new ProcessedEventRepository(db, CONSUMER);

  const startDiagnostic = new StartDiagnosticUseCase(
    queueRepository,
    logRepository,
  );

  await startConsumer({
    handlers: {
      'cmd.workshop.start-diagnostic':
        makeStartDiagnosticHandler(startDiagnostic),
    },
    isFirstDelivery: processedEvents.isFirstDelivery,
    bindings: ['cmd.workshop.*'],
    channel,
  });
};
