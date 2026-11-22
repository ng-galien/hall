import type { CreatedGeographicFeatureNote, ResourceDetail } from "@hall/api-contract";
import { serializeImageDirective } from "@hall/templating";
import { useReducer, useRef } from "react";
import { imageUploadsPending, imageUploadsSettled, trackTextSave } from "../../components/editor/imageUploadGate";
import { ApiError, type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import type { InlineTextDraft } from "../resources/InlineResourceContent";
import { openSessionResource } from "../resources/useResourceSession";
import type { GeographicNoteInitial } from "./geographicLayersApi";

interface Draft {
  content: string;
  savedContent: string;
  error: ApiErrorCode | null;
  initial: GeographicNoteInitial | null;
  created: CreatedGeographicFeatureNote | null;
  version: number | null;
  preparing: Promise<CreatedGeographicFeatureNote> | null;
  saving: Promise<void> | null;
  firstImagePlaced: boolean;
}

/** Keeps the first edit by map subject until the canonical text session can take over. */
export function useGeographicNoteDrafts() {
  const drafts = useRef(new Map<string, Draft>());
  const [, refresh] = useReducer((revision: number) => revision + 1, 0);

  return (
    key: string,
    existingId: string | null,
    create: (initial: GeographicNoteInitial) => Promise<CreatedGeographicFeatureNote>,
  ): InlineTextDraft | undefined => {
    const previous = drafts.current.get(key);
    if (!previous && existingId) return undefined;
    const draft: Draft = previous ?? {
      content: "",
      savedContent: "",
      error: null,
      initial: null,
      created: null,
      version: null,
      preparing: null,
      saving: null,
      firstImagePlaced: false,
    };

    const initialize = (input: GeographicNoteInitial) => {
      if (draft.preparing) return draft.preparing;
      if (draft.created && draft.version !== null) return Promise.resolve(draft.created);
      draft.initial ??= input;
      const initial = draft.initial;
      drafts.current.set(key, draft);
      draft.preparing = create(initial)
        .then((note) => {
          draft.created = note;
          if (note.initialVersion === null) throw new ApiError("conflict", 409);
          if (note.initialVersion === undefined || (initial.kind === "image" && !note.initialAsset)) {
            throw new ApiError("request_failed", 0);
          }
          draft.version = note.initialVersion;
          draft.savedContent = note.initialAsset
            ? serializeImageDirective({ id: note.initialAsset.id, alt: note.initialAsset.title })
            : initial.kind === "text"
              ? initial.content
              : "";
          draft.error = null;
          return note;
        })
        .catch((failure: unknown) => {
          if (
            !draft.created &&
            initial.kind === "text" &&
            failure instanceof ApiError &&
            [400, 409, 413, 422].includes(failure.status)
          ) {
            draft.initial = null;
          }
          draft.error = apiErrorCode(failure);
          throw failure;
        })
        .finally(() => {
          draft.preparing = null;
          refresh();
        });
      return draft.preparing;
    };

    const save = () => {
      if (draft.saving || (draft.error === "conflict" && draft.created) || (!draft.initial && !draft.content.trim()))
        return;
      const run = async () => {
        const note = await initialize({ kind: "text", content: draft.content });
        if (imageUploadsPending()) await imageUploadsSettled();
        if (note.initialAsset && !draft.firstImagePlaced) {
          draft.content = [draft.content.trimEnd(), draft.savedContent].filter(Boolean).join("\n\n");
          draft.firstImagePlaced = true;
        }
        while (draft.savedContent !== draft.content) {
          if (imageUploadsPending()) await imageUploadsSettled();
          const version = draft.version;
          if (version === null) throw new ApiError("request_failed", 0);
          const content = draft.content;
          const updated: ResourceDetail | null = await trackTextSave(
            useWorkspaceResourcesStore.getState().updateContent(note.noteId, {
              kind: "text",
              expectedVersion: version,
              content,
            }),
          );
          if (updated?.kind === "text") {
            draft.version = updated.version;
          } else {
            const error = useWorkspaceResourcesStore.getState().error ?? "request_failed";
            useWorkspaceResourcesStore.setState({ error: null });
            if (error !== "conflict") throw new ApiError(error, 0);
            const opened = await openSessionResource(note.noteId);
            if (opened?.data.kind !== "text" || opened.data.content !== content) throw new ApiError(error, 409);
            draft.version = opened.data.version;
          }
          draft.savedContent = content;
        }
      };
      draft.error = null;
      draft.saving = run()
        .catch((failure: unknown) => {
          draft.error = apiErrorCode(failure);
        })
        .finally(() => {
          draft.saving = null;
          refresh();
        });
      refresh();
    };

    return {
      content: draft.content,
      error: draft.error,
      retry:
        draft.error && !(draft.error === "conflict" && draft.created) && (draft.initial || draft.content.trim())
          ? save
          : undefined,
      noteId: draft.created?.noteId ?? null,
      readyVersion:
        !draft.preparing && !draft.saving && !draft.error && draft.content === draft.savedContent
          ? draft.version
          : null,
      async uploadImage(file, title, uploadExisting) {
        if (draft.error === "conflict" && draft.created) throw new ApiError("conflict", 409);
        const input: GeographicNoteInitial = { kind: "image", file, title };
        const first = !draft.initial || (draft.initial.kind === "image" && draft.initial.file === file);
        const note = await initialize(input);
        if (!first || !note.initialAsset) return uploadExisting(note.noteId);
        save();
        return { id: note.initialAsset.id, label: note.initialAsset.title };
      },
      change(content) {
        drafts.current.set(key, draft);
        draft.content = content;
        if (draft.created?.initialAsset && content.includes(draft.created.initialAsset.id))
          draft.firstImagePlaced = true;
        if (!draft.error) save();
        refresh();
      },
      release() {
        if (drafts.current.get(key) !== draft) return;
        drafts.current.delete(key);
        refresh();
      },
    };
  };
}
