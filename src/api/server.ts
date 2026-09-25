import '@/infrastructure/observability/logger-trace';

import { makeDiagnosticRoutes } from '@/adapters/input/http/diagnostic-routes';
import { RabbitMqEventPublisher } from '@/adapters/output/messaging/rabbitmq-event-publisher';
import {
  type CompleteDiagnostic,
  CompleteDiagnosticUseCase,
} from '@/application/use-cases/execution/complete-diagnostic';
import { getDb } from '@/infrastructure/configs/mongo';
import { ExecutionLogRepository } from '@/infrastructure/repositories/execution/execution-log-repository';
import { ExecutionQueueRepository } from '@/infrastructure/repositories/execution/execution-queue-repository';
import { startMessaging } from './messaging';
import {
  createHttpMetrics,
  getMetrics,
  metricsContentType,
} from '@/infrastructure/observability/metrics';
import { tracing } from '@/infrastructure/observability/tracing';
import openapi from '@elysiajs/openapi';
import Elysia from 'elysia';
import logger from '@lucas-pmelo/logger';
import z from 'zod';

export const app = new Elysia();

if (tracing) {
  app.use(tracing);
}

const httpMetrics = createHttpMetrics();

app.onRequest(({ request }) => {
  if (new URL(request.url).pathname !== '/metrics') {
    httpMetrics.start(request);
  }
});

app.onAfterHandle(({ request, set, responseValue }) => {
  if (new URL(request.url).pathname !== '/metrics') {
    const status =
      responseValue instanceof Response ? responseValue.status : set.status;
    httpMetrics.finish(request, status);
  }
});

app.onError(({ request, set, error }) => {
  if (new URL(request.url).pathname !== '/metrics') {
    const status = (error as { status?: number })?.status ?? set.status ?? 500;
    httpMetrics.finish(request, status);
  }
});

app.use(
  openapi({
    documentation: {
      info: {
        title: 'bunzina-workshop API',
        version: '1.0.0',
        description: 'Microsserviço do Bunzina — Fase 4.',
      },
      tags: [
        { name: 'Health', description: 'Verificação de saúde do serviço' },
        {
          name: 'Diagnostics',
          description: 'Ações do mecânico durante o diagnóstico da OS',
        },
      ],
    },
    path: '/swagger',
    mapJsonSchema: { zod: z.toJSONSchema },
  }),
);

app.get('/health', () => Response.json({ status: 'ok' }), {
  detail: { tags: ['Health'] },
});

app.get('/metrics', async () => {
  return new Response(await getMetrics(), {
    status: 200,
    headers: { 'Content-Type': metricsContentType },
  });
});

app.get('/ready', async ({ set }) => {
  try {
    await checkDependencies();

    return Response.json({ status: 'ready' });
  } catch (cause) {
    logger.error({
      message: `Readiness check failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    });

    set.status = 503;

    return Response.json({ status: 'not_ready' }, { status: 503 });
  }
});

async function checkDependencies(): Promise<void> {
  const db = await getDb();
  await db.command({ ping: 1 });
}

const completeDiagnostic: CompleteDiagnostic = {
  execute: async (input) => {
    const db = await getDb();

    return new CompleteDiagnosticUseCase(
      new ExecutionQueueRepository(db),
      new ExecutionLogRepository(db),
      new RabbitMqEventPublisher(),
    ).execute(input);
  },
};

app.use(makeDiagnosticRoutes(completeDiagnostic));

app.get('/', ({ redirect }) => redirect('/swagger'), {
  detail: { hide: true },
});

/* c8 ignore next */
if (import.meta.main) {
  await startMessaging();

  app.listen(3000, () => {
    logger.info({
      message: 'Server is running on http://localhost:3000/swagger',
    });
  });
}
