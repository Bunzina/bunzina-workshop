import { beforeEach, describe, expect, it, mock } from 'bun:test';

const error = mock((_payload: { message: string }) => {});
const command = mock(async () => ({ ok: 1 }));
const findOne = mock(async () => null);
const getDb = mock(
  async () => ({ command, collection: () => ({ findOne }) }) as never,
);

mock.module('@lucas-pmelo/logger', () => ({
  default: {
    setEvent: () => {},
    setRequestId: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error,
  },
}));

mock.module('@/infrastructure/configs/mongo', () => ({ getDb }));

const { app } = await import('./server');
const { getMetrics } = await import('@/infrastructure/observability/metrics');

beforeEach(() => {
  error.mockClear();
  command.mockClear();
  getDb.mockClear();
});

describe('GET /ready', () => {
  it('reports the service as ready when the database answers the ping', async () => {
    const response = await app.handle(new Request('http://localhost/ready'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
  });

  it('answers 503 and logs the reason when a dependency fails', async () => {
    getDb.mockImplementationOnce(async () => {
      throw new Error('MONGODB_URI is required');
    });

    const response = await app.handle(new Request('http://localhost/ready'));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'not_ready' });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      message: 'Readiness check failed: MONGODB_URI is required',
    });
  });
});

describe('GET /health', () => {
  it('reports the service as ok', async () => {
    const response = await app.handle(new Request('http://localhost/health'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /metrics', () => {
  it('exposes the prometheus registry', async () => {
    await app.handle(new Request('http://localhost/health'));

    const response = await app.handle(new Request('http://localhost/metrics'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(await response.text()).toContain('http_requests_total');
  });
});

describe('GET /', () => {
  it('redirects to the swagger page', async () => {
    const response = await app.handle(new Request('http://localhost/'));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/swagger');
  });
});

describe('PATCH /diagnostics/:serviceOrderId', () => {
  it('reaches the queue and answers 404 for an unknown service order', async () => {
    const serviceOrderId = crypto.randomUUID();

    const response = await app.handle(
      new Request(`http://localhost/diagnostics/${serviceOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagnosedItems: { services: [], autoParts: [] },
          diagnosedBy: 'mecanico-07',
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(findOne).toHaveBeenCalledWith({ serviceOrderId });
  });

  it('is described in the swagger', async () => {
    const response = await app.handle(
      new Request('http://localhost/swagger/json'),
    );
    const document = (await response.json()) as {
      paths: Record<string, { patch?: unknown }>;
    };

    expect(
      document.paths['/diagnostics/{serviceOrderId}']?.patch,
    ).toBeDefined();
  });
});

describe('PATCH /executions/:serviceOrderId/items', () => {
  it('reaches the queue and answers 404 for an unknown service order', async () => {
    const serviceOrderId = crypto.randomUUID();

    const response = await app.handle(
      new Request(`http://localhost/executions/${serviceOrderId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services: [{ serviceId: crypto.randomUUID() }],
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(findOne).toHaveBeenCalledWith({ serviceOrderId });
  });

  it('is described in the swagger', async () => {
    const response = await app.handle(
      new Request('http://localhost/swagger/json'),
    );
    const document = (await response.json()) as {
      paths: Record<string, { patch?: unknown }>;
    };

    expect(
      document.paths['/executions/{serviceOrderId}/items']?.patch,
    ).toBeDefined();
  });
});

describe('an unknown route', () => {
  it('answers 404 and still records the request', async () => {
    const response = await app.handle(new Request('http://localhost/nope'));

    expect(response.status).toBe(404);
    expect(await getMetrics()).toContain('route="/nope"');
  });
});
