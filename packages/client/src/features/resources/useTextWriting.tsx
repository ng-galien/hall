import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import { ScreenActions } from "../../shell/headerTrail";

/** The part of a text session the two writing modes need. */
export interface WritableText {
  /** Identifier of the opened text; a new identifier starts again in its own mode. */
  id: string | null;
  editable: boolean;
  content: string;
  dirty: boolean;
  flush(): Promise<boolean>;
  save(): Promise<boolean>;
  reload(): Promise<boolean>;
}

/**
 * The two writing modes of a text (choice 8B), on phone, tablet and computer: a text opens for reading with
 * « Modifier » in the screen header for whoever may write it, as the last command before the initials; while writing, « Terminé » in solid blue saves it and
 * returns to reading. A note still empty, just created, opens for writing.
 * @implements-requirement HALL-FR-LAY-130
 */
export function useTextWriting(text: WritableText): { editing: boolean; control: ReactNode } {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const decided = useRef<string | null>(null);
  useEffect(() => {
    if (!text.id || decided.current === text.id) return;
    decided.current = text.id;
    setEditing(text.editable && text.content.trim() === "");
  }, [text.id, text.editable, text.content]);
  const finish = async () => {
    await text.flush();
    if ((text.dirty ? await text.save() : true) && (await text.reload())) setEditing(false);
  };
  const control = text.editable ? (
    <ScreenActions>
      {editing ? (
        <Button className="screen-header-writing" data-testid="text-finish-editing" onClick={() => void finish()}>
          {t("workspace.finishEditing")}
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="screen-header-writing"
          data-testid="text-edit"
          onClick={() => setEditing(true)}
        >
          {t("common.edit")}
        </Button>
      )}
    </ScreenActions>
  ) : null;
  return { editing: editing && text.editable, control };
}
