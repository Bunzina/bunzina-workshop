import { afterEach, describe, expect, it } from 'bun:test';
import {
  createHttpMetrics,
  getMetrics,
  normalizeRoute,
  trackExecutionQueue,
} from './metrics';

describe('normalizeRoute', () => {
  it('keeps a static path as it is', () => {
    expect(normalizeRoute('/health')).toBe('/health');
  });

  it('falls back to the root for an empty path', () => {
    expect(normalizeRoute('')).toBe('/');
  });
});

describe('createHttpMetrics', () => {
  it('records a finished request under its method and status', async () => {
    const metrics = createHttpMetrics();
    const request = new Request('http://localhost/health');

    metrics.start(request);
    metrics.finish(request, 200);

    const exposed = await getMetrics();

    expect(exposed).toContain('http_requests_total');
    expect(exposed).toContain('status_code="200"');
  });

  it('defaults to 200 when the status is not a usable number', async () => {
    const metrics = createHttpMetrics();
    const request = new Request('http://localhost/ready');

    metrics.start(request);
    metrics.finish(request, undefined);

    expect(await getMetrics()).toContain('route="/ready"');
  });

  it('records a request that was never started', async () => {
    const metrics = createHttpMetrics();
    const request = new Request('http://localhost/metrics-less');

    metrics.finish(request, 500);

    expect(await getMetrics()).toContain('status_code="500"');
  });
});

describe('normalizeRoute com identificadores', () => {
  it('colapsa um uuid no caminho para :id', () => {
    expect(
      normalizeRoute('/service-orders/0193f2a1-4c7e-7000-8000-000000000001'),
    ).toBe('/service-orders/:id');
  });

  it('colapsa todos os uuids de um caminho aninhado', () => {
    const path =
      '/service-orders/0193f2a1-4c7e-7000-8000-000000000001' +
      '/items/0193f2a1-4c7e-7000-8000-000000000002';

    expect(normalizeRoute(path)).toBe('/service-orders/:id/items/:id');
  });
});

describe('normalizeRoute com as rotas da oficina', () => {
  it.each([
    ['/diagnostics/order-1', '/diagnostics/:id'],
    ['/diagnostics/order-1/failure', '/diagnostics/:id/failure'],
    ['/executions/order-1/items', '/executions/:id/items'],
    ['/executions/order-1/failure', '/executions/:id/failure'],
  ])('agrupa %s em %s mesmo sem uuid', (path, route) => {
    expect(normalizeRoute(path)).toBe(route);
  });
});

describe('execution queue gauge', () => {
  afterEach(() => {
    trackExecutionQueue(undefined);
  });

  it('exposes how many service orders are in each status', async () => {
    trackExecutionQueue(async () => ({ IN_DIAGNOSTIC: 3, IN_EXECUTION: 1 }));

    const exposed = await getMetrics();

    expect(exposed).toContain(
      'bunzina_workshop_execution_queue_items{status="IN_DIAGNOSTIC"} 3',
    );
    expect(exposed).toContain(
      'bunzina_workshop_execution_queue_items{status="IN_EXECUTION"} 1',
    );
    expect(exposed).toContain(
      'bunzina_workshop_execution_queue_items{status="ABORTED"} 0',
    );
  });

  it('keeps serving the other metrics when the queue cannot be counted', async () => {
    trackExecutionQueue(async () => {
      throw new Error('mongo down');
    });

    expect(await getMetrics()).toContain('http_requests_total');
  });

  it('reports a failure that is not an Error as well', async () => {
    trackExecutionQueue(() => Promise.reject('timeout'));

    expect(await getMetrics()).toContain('http_requests_total');
  });
});
