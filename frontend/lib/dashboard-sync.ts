import type { Command, DashboardData } from './dashboard';

export type ResourceResult<T> = { ok: true; value: T } | { ok: false; error: string };
type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

// Mỗi API có kết quả riêng: lỗi danh sách lệnh không chặn dữ liệu cảm biến.
export async function readResource<T>(
  url: string,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
  timeoutMs = 12_000,
): Promise<ResourceResult<T>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetcher(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { ok: true, value: await response.json() as T };
  } catch (error) {
    return { ok: false, error: timedOut ? 'Hết thời gian chờ backend' : error instanceof Error ? error.message : 'Không kết nối được backend' };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

export type ResourceState<T> = { value: T | null; error: string; updatedAt: number | null };

export function acceptResult<T>(previous: ResourceState<T>, result: ResourceResult<T>, now: number): ResourceState<T> {
  return result.ok
    ? { value: result.value, error: '', updatedAt: now }
    : { ...previous, error: result.error };
}

export async function refreshResources(options: {
  signal: AbortSignal;
  onDashboard: (result: ResourceResult<DashboardData>) => void;
  onCommands: (result: ResourceResult<Command[]>) => void;
  fetcher?: Fetcher;
  timeoutMs?: number;
}) {
  const { signal, fetcher, timeoutMs, onDashboard, onCommands } = options;
  await Promise.all([
    readResource<DashboardData>('/api/backend/dashboard', signal, fetcher, timeoutMs).then(result => {
      if (!signal.aborted) onDashboard(result);
    }),
    readResource<Command[]>('/api/backend/commands', signal, fetcher, timeoutMs).then(result => {
      if (!signal.aborted) {
        const body: unknown = result.ok ? result.value : null;
        if (result.ok) {
          const items = Array.isArray(body) ? body : (body as {items?: unknown})?.items;
          onCommands(Array.isArray(items) ? {ok:true,value:items} : {ok:false,error:'Danh sách lệnh sai định dạng.'});
        } else onCommands(result);
      }
    }),
  ]);
}
