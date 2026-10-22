'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Command, DashboardData } from '../lib/dashboard';
import { acceptResult, refreshResources, ResourceState } from '../lib/dashboard-sync';

export function useDashboard() {
  const [dashboard, setDashboard] = useState<ResourceState<DashboardData>>({ value: null, error: '', updatedAt: null });
  const [commands, setCommands] = useState<ResourceState<Command[]>>({ value: null, error: '', updatedAt: null });
  const [loading, setLoading] = useState(false);
  const mounted = useRef(false);
  const active = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!mounted.current || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    const isCurrent = () => mounted.current && active.current === controller && !controller.signal.aborted;
    try {
      await refreshResources({
        signal: controller.signal,
        onDashboard: result => {
          if (isCurrent()) setDashboard(previous => acceptResult(previous, result, Date.now()));
        },
        onCommands: result => {
          if (isCurrent()) setCommands(previous => acceptResult(previous, result, Date.now()));
        },
      });
    } finally {
      if (isCurrent()) {
        active.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
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

  return { dashboard, commands, loading, refresh };
}
