"use client";

import { useEffect, useState } from "react";
import type { PipelineState } from "@/lib/pipeline-types";

export interface UsePipelineResult {
  data: PipelineState | null;
  loading: boolean;
  error: string | null;
  /** True while the real pipeline has not produced a package size yet. */
  isPending: boolean;
}

export function usePipeline(): UsePipelineResult {
  const [data, setData] = useState<PipelineState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pipeline", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as PipelineState;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "fetch failed");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isPending = data ? data.stages.pack.package_mb == null : true;
  return { data, loading, error, isPending };
}
