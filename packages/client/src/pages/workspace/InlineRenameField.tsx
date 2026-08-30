import { type ReactNode, useEffect, useRef, useState } from "react";

export type InlineRenameEndReason = "blur" | "cancel" | "commit";

export function InlineRenameField({
  value,
  editing,
  onEditingChange,
  onCommit,
  label,
  className,
  testId,
  children,
}: {
  value: string;
  editing: boolean;
  onEditingChange(editing: boolean, reason?: InlineRenameEndReason): void;
  onCommit(value: string): Promise<boolean>;
  label: string;
  className: string;
  testId: string;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const commitActive = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) setDraft(value);
  }, [editing, value]);

  useEffect(() => {
    if (!editing) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
    return () => window.clearTimeout(timer);
  }, [editing]);

  const commit = async (reason: "blur" | "commit") => {
    if (commitActive.current) return;
    const nextValue = draft.trim();
    if (!nextValue || nextValue === value) {
      setDraft(value);
      onEditingChange(false, reason);
      return;
    }
    commitActive.current = true;
    setSaving(true);
    try {
      if (await onCommit(nextValue)) onEditingChange(false, reason);
    } finally {
      commitActive.current = false;
      setSaving(false);
    }
  };

  if (!editing) return children;

  return (
    <input
      ref={inputRef}
      autoFocus
      className={className}
      data-testid={testId}
      value={draft}
      aria-label={label}
      disabled={saving}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => void commit("blur")}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          void commit("commit");
        }
        if (event.key === "Escape" && !saving) {
          event.preventDefault();
          setDraft(value);
          onEditingChange(false, "cancel");
        }
      }}
    />
  );
}
