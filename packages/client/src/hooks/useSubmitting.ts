import { useCallback, useRef, useState } from "react";

/** Runs one action at a time; `run` refuses an action while another is on its way, `runAfter` waits for it. */
export function useSubmitting() {
  const active = useRef<Promise<void> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const run = useCallback(async <Result>(action: () => Promise<Result>): Promise<Result | undefined> => {
    if (active.current) return undefined;
    let settle: (() => void) | undefined;
    active.current = new Promise<void>((resolve) => {
      settle = resolve;
    });
    setSubmitting(true);
    try {
      return await action();
    } finally {
      settle?.();
      active.current = null;
      setSubmitting(false);
    }
  }, []);

  const runAfter = useCallback(
    async <Result>(action: () => Promise<Result>): Promise<Result | undefined> => {
      while (active.current) await active.current;
      return run(action);
    },
    [run],
  );

  return { submitting, run, runAfter };
}
