import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type InlineRenameEndReason = "blur" | "cancel" | "commit";

export function InlineRenameInput({
  className,
  onClick,
  onDoubleClick,
  onDragStart,
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn("inline-rename-input", className)}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick?.(event);
      }}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDragStart?.(event);
      }}
    />
  );
}

export function InlineRenameField({
  value,
  editing,
  onEditingChange,
  onCommit,
  label,
  className,
  testId,
  commitUnchanged = false,
  commitOnBlur = true,
  children,
}: {
  value: string;
  editing: boolean;
  onEditingChange(editing: boolean, reason?: InlineRenameEndReason): void;
  onCommit(value: string): Promise<boolean>;
  label: string;
  className: string;
  testId: string;
  commitUnchanged?: boolean;
  commitOnBlur?: boolean;
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
    if (!nextValue || (!commitUnchanged && nextValue === value)) {
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
    <InlineRenameInput
      ref={inputRef}
      autoFocus
      className={className}
      data-testid={testId}
      value={draft}
      aria-label={label}
      disabled={saving}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => {
        if (commitOnBlur) void commit("blur");
        else onEditingChange(false, "cancel");
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
