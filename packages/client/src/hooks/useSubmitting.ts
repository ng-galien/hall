import { useCallback, useRef, useState } from "react";

export function useSubmitting() {
  const active = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const run = useCallback(async <Result>(action: () => Promise<Result>): Promise<Result | undefined> => {
    if (active.current) return undefined;
    active.current = true;
    setSubmitting(true);
    try {
      return await action();
    } finally {
      active.current = false;
      setSubmitting(false);
    }
  }, []);

  return { submitting, run };
}
