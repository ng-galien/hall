import type { ReactNode, Ref } from "react";
import { DeleteIcon } from "../icons";
import { Button } from "../ui/button";
import "./EditorMediaOverlay.css";

export function EditorMediaOverlay({
  icon,
  title,
  children,
  testId,
  onTitleClick,
  titleTestId,
  titleAriaLabel,
  titleRef,
  onDelete,
  deleteLabel,
  deleteTestId,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  testId: string;
  onTitleClick?: () => void;
  titleTestId?: string;
  titleAriaLabel?: string;
  titleRef?: Ref<HTMLButtonElement>;
  onDelete?: () => void;
  deleteLabel?: string;
  deleteTestId?: string;
}) {
  return (
    <aside className="editor-media-overlay" data-testid={testId} contentEditable={false}>
      <span className="editor-media-overlay-icon" aria-hidden="true">
        {icon}
      </span>
      {onTitleClick ? (
        <Button
          ref={titleRef}
          variant="plain"
          className="editor-media-overlay-title"
          data-testid={titleTestId}
          title={title}
          aria-label={titleAriaLabel ?? title}
          onClick={onTitleClick}
        >
          {title}
        </Button>
      ) : (
        <strong className="editor-media-overlay-title" title={title}>
          {title}
        </strong>
      )}
      <span className="editor-media-overlay-actions">
        {children}
        {onDelete ? (
          <Button variant="plain" size="icon" data-testid={deleteTestId} aria-label={deleteLabel} onClick={onDelete}>
            <DeleteIcon />
          </Button>
        ) : null}
      </span>
    </aside>
  );
}
