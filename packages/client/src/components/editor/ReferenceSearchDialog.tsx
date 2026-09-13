import { type ReferenceEntityKind, referenceEntityKinds } from "@hall/domain";
import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "../../i18n/I18nProvider";
import { ResourceSearch } from "../search/ResourceSearch";
import type { Mentionable } from "./references";
import { EditorResourceEmbedSearch } from "./resourceEmbeds";

export function ReferenceSearchDialog({
  initialQuery,
  mentionables,
  context,
  allowedKinds,
  title,
  testId = "reference-search-dialog",
  onPick,
  onClose,
}: {
  initialQuery: string;
  mentionables: Mentionable[];
  context?: string;
  allowedKinds?: readonly ReferenceEntityKind[];
  title?: string;
  testId?: string;
  onQueryChange?(query: string): void;
  onPick(item: Mentionable): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="reference-search-dialog" data-testid={testId} closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{title ?? t("editor.embedResource")}</DialogTitle>
        </DialogHeader>
        <ResourceSearch
          items={mentionables}
          initialQuery={initialQuery}
          scope={{ types: allowedKinds, context }}
          testId="reference-search"
          onPick={onPick}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

export interface FullSearchRequest {
  query: string;
  selected?: Mentionable;
  /** The `@` query range to replace when opened from the mention menu. */
  range?: { from: number; to: number };
}

/** Bridges an editor to the full search: opens it, inserts at the caret, closes. */
export function EditorReferenceSearch({
  editor,
  request,
  mentionables,
  context,
  onClose,
}: {
  editor: Editor;
  request: FullSearchRequest;
  mentionables: RefObject<Mentionable[]>;
  context: RefObject<string | undefined>;
  onClose(): void;
}) {
  return (
    <EditorResourceEmbedSearch
      editor={editor}
      request={request}
      mentionables={mentionables}
      context={context}
      allowedKinds={referenceEntityKinds}
      testId="reference-search-dialog"
      onClose={onClose}
    />
  );
}
