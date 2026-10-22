'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readResource, acceptResult, ResourceState } from '../lib/dashboard-sync';
import { ManualOverride, parseOverrides } from '../lib/manual-control';

export function useManualOverrides(deviceId: string) {
  const [resource, setResource] = useState<ResourceState<ManualOverride[]>>({ value: null, error: '', updatedAt: null });
  const mounted = useRef(false);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!mounted.current || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const result = await readResource<unknown>(`/api/backend/automation/overrides/${encodeURIComponent(deviceId)}`, controller.signal);
    if (!mounted.current || active.current !== controller || controller.signal.aborted) return;
    try {
      const checked = result.ok ? { ok: true as const, value: parseOverrides(result.value, deviceId) } : result;
      setResource(previous => acceptResult(previous, checked, Date.now()));
    } catch (error) {
      setResource(previous => ({ ...previous, error: error instanceof Error ? error.message : 'Không đọc được chế độ thủ công.' }));
    } finally {
      active.current = null;
    }
  }, [deviceId]);

  useEffect(() => {
    mounted.current = true;
    setResource({ value: null, error: '', updatedAt: null });
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      await refresh();
      if (!stopped) timer = setTimeout(() => void poll(), 4_000);
    }
    void poll();
    return () => {
      stopped = true;
      mounted.current = false;
      clearTimeout(timer);
      active.current?.abort();
      active.current = null;
    };
  }, [refresh]);
  return { ...resource, refresh };
}
