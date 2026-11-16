"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated number count-up. Returns null while `target` is null (pending),
 * so callers can render skeletons for values that have not arrived yet.
 */
export function useCountUp(
  target: number | null,
  durationMs = 900
): number | null {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target == null) return;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return target == null ? null : value;
}
