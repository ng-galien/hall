import { type ReactNode, useEffect, useRef, useState } from "react";
import { imageUploadsPending, imageUploadsSettled } from "../../components/editor/imageUploadGate";
import { EditIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import { useBackLayer } from "../../lib/backLayers";
import { ScreenActions } from "../../shell/headerTrail";
import { usePhoneLayout } from "../../shell/usePhoneLayout";

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
  /** A note opens for writing while it is still empty; the report of a business always opens for reading. */
  opensEmptyForWriting?: boolean;
}

/**
 * The two writing modes of a text (choice 8B), on phone, tablet and computer: a text opens for reading with
 * « Modifier » for whoever may write it, as the main command of the line of the title on tablet and computer, and as
 * the last command before the initials on a phone; while writing, « Terminé » in solid blue saves it and
 * returns to reading. A note still empty, just created, opens for writing. On a phone the back command ends the
 * writing as « Terminé » does, before it leaves the screen.
 * @implements-requirement HALL-FR-LAY-130
 * @implements-requirement HALL-FR-LAY-010
 */
export function useTextWriting(text: WritableText): { editing: boolean; control: ReactNode; button: ReactNode } {
  const { t } = useI18n();
  const phone = usePhoneLayout();
  const [editing, setEditing] = useState(false);
  const decided = useRef<string | null>(null);
  useEffect(() => {
    if (!text.id || decided.current === text.id) return;
    decided.current = text.id;
    setEditing(text.opensEmptyForWriting !== false && text.editable && text.content.trim() === "");
  }, [text.id, text.editable, text.content, text.opensEmptyForWriting]);
  const latest = useRef(text);
  latest.current = text;
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  const finish = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    try {
      if (imageUploadsPending()) await imageUploadsSettled();
      await latest.current.flush();
      const current = latest.current;
      if ((current.dirty ? await current.save() : true) && (await current.reload())) setEditing(false);
    } finally {
      finishingRef.current = false;
      setFinishing(false);
    }
  };
  useBackLayer(phone && editing && text.editable, () => void finish());
  const button = text.editable ? (
    editing ? (
      <Button
        className="screen-header-writing"
        data-testid="text-finish-editing"
        disabled={finishing}
        pending={finishing}
        onClick={() => void finish()}
      >
        {t("workspace.finishEditing")}
      </Button>
    ) : (
      <Button
        variant="plain"
        size="icon"
        className="screen-header-writing"
        data-testid="text-edit"
        aria-label={t("common.edit")}
        onClick={() => setEditing(true)}
      >
        <EditIcon />
      </Button>
    )
  ) : null;
  if (!phone) return { editing: text.editable, control: null, button: null };
  const control = button ? <ScreenActions>{button}</ScreenActions> : null;
  return { editing: editing && text.editable, control, button };
}
