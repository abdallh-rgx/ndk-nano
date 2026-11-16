"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface GhStatus {
  repo: { stars: number; html_url: string; pushed_at: string } | null;
  latest_run: {
    status: string;
    conclusion: string | null;
    html_url: string;
    created_at: string;
    head_sha: string;
  } | null;
  latest_release: {
    tag: string;
    asset_name: string | null;
    asset_mb: number | null;
    html_url: string;
  } | null;
  error: string | null;
}

export interface UseGhStatusResult {
  data: GhStatus | null;
  loading: boolean;
  refetch: () => void;
}

export function useGhStatus(refetchMs = 0): UseGhStatusResult {
  const [data, setData] = useState<GhStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/gh/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as GhStatus);
    } catch {
      setData((prev) =>
        prev ?? { repo: null, latest_run: null, latest_release: null, error: "unavailable" }
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (refetchMs > 0) {
      timerRef.current = setInterval(load, refetchMs);
    }
    return () => {
      if (timerRef.current != null) clearInterval(timerRef.current);
    };
  }, [load, refetchMs]);

  return { data, loading, refetch: load };
}
