import logger from '@lucas-pmelo/logger';
import { closeDb, getDb } from '@/infrastructure/configs/mongo';

/**
 * Equivalente às migrations dos serviços com Postgres. O Mongo não exige schema,
 * mas os índices são obrigatórios: o de `processed_events` é o que garante a
 * idempotência do consumo, e sem ele um redelivery do RabbitMQ aplica o mesmo
 * efeito duas vezes.
 */
export const ensureIndexes = async (): Promise<void> => {
  const db = await getDb();

  await db
    .collection('processed_events')
    .createIndex({ eventId: 1, consumer: 1 }, { unique: true });

  await db
    .collection('execution_queue')
    .createIndex({ serviceOrderId: 1 }, { unique: true });
  await db.collection('execution_queue').createIndex({ status: 1 });
  await db.collection('execution_queue').createIndex({ enqueuedAt: 1 });

  await db.collection('execution_logs').createIndex({ serviceOrderId: 1 });
  await db.collection('execution_logs').createIndex({ occurredAt: -1 });

  logger.info({ message: 'Mongo indexes ensured' });
};

if (import.meta.main) {
  await ensureIndexes();
  await closeDb();
}
