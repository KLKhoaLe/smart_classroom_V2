type Options = { backendUrl?: string; token?: string; fetcher?: typeof fetch; timeoutMs?: number };
export async function proxyHistory(request: Request, options: Options = {}): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const device = query.get('device_id');
  if (!device || !/^[A-Za-z0-9_-]{1,100}$/.test(device) || query.getAll('device_id').length !== 1
    || [...query.keys()].some(key => key !== 'device_id')) {
    return Response.json({ error: 'Cần một device_id hợp lệ để đọc lịch sử.' }, { status: 400 });
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) controller.abort();
  const timer = setTimeout(abort, options.timeoutMs ?? 10_000);
  try {
    const url = new URL(`${(options.backendUrl || 'http://127.0.0.1:3001').replace(/\/$/, '')}/api/telemetry`);
    url.searchParams.set('device_id', device);
    const result = await (options.fetcher ?? fetch)(url, { method: 'GET', cache: 'no-store', redirect: 'error',
      signal: controller.signal, headers: { accept: 'application/json', ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) } });
    if (!result.ok) {
      await result.body?.cancel();
      return Response.json({ error: `Không đọc được lịch sử (HTTP ${result.status}).` }, { status: result.status });
    }
    return Response.json(await result.json(), { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Không kết nối được backend để đọc lịch sử.' }, { status: 503 });
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
  }
}
