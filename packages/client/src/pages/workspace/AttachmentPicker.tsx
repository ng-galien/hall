import { matchLiteral } from "@hall/domain";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AddIcon } from "../../components/icons";
import { ResourceSearch } from "../../components/search/ResourceSearch";
import type { DocumentaryLeafSummary } from "../../features/documents/DocumentaryResourceGlyph";
import { resourceMentionable } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { useWorkspaceCreation, workspaceCreateLabels } from "./WorkspaceCreateMenu";
import { type WorkspaceCreateKind, workspaceCreateKindIcons, workspaceCreateKinds } from "./workspaceCreateKind";
import "./AttachmentPicker.css";

const attachmentKinds = workspaceCreateKinds.filter((kind) => kind !== "councilMatter");

// @implements-requirement HALL-FR-SRC-050
/**
 * The one attachment picker of a council business: it creates a document of any kind in the business, or attaches
 * an existing document found with the shared search, its filters and its folder browsing.
 */
export function AttachmentPicker({
  business,
  onCreate,
  onAttached,
  onError,
  anchorPoint,
  open: controlledOpen,
  onOpenChange,
  disabled,
}: {
  business: CouncilBusinessView;
  onCreate(kind: WorkspaceCreateKind, title?: string): Promise<boolean>;
  onAttached?(resourceId: string): void;
  onError?(error: ApiErrorCode): void;
  /** Opens the picker at a point, for a context menu; without it the picker renders its own button. */
  anchorPoint?: { x: number; y: number };
  open?: boolean;
  onOpenChange?(open: boolean): void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    setLocalOpen(value);
    onOpenChange?.(value);
  };
  const capabilities = useCouncilBusinessStore((state) => state.capabilitiesById[business.id]);
  const summaries = useWorkspaceResourcesStore((state) => state.summaries);
  const preparedSubjects = useCouncilBusinessStore((state) => state.preparedSubjects);
  const creation = useWorkspaceCreation({
    onCreate,
    getError: () => useWorkspaceResourcesStore.getState().error ?? useCouncilBusinessStore.getState().error,
    clearError: () => {
      useWorkspaceResourcesStore.setState({ error: null });
      useCouncilBusinessStore.setState({ error: null });
    },
  });
  const excludedIds = useMemo(
    () => [
      business.folderResourceId,
      business.reportResourceId,
      ...business.resources.map(({ id }) => id),
      ...preparedSubjects
        .filter((subject) => subject.councilBusinessId === business.id)
        .map((subject) => subject.textResourceId),
    ],
    [business, preparedSubjects],
  );
  const candidates = useMemo(
    () =>
      Object.values(summaries).filter(
        (resource): resource is DocumentaryLeafSummary =>
          resource.kind !== "folder" && !excludedIds.includes(resource.id),
      ),
    [excludedIds, summaries],
  );
  const canCreate = (kind: WorkspaceCreateKind) =>
    matchLiteral(kind, {
      councilMatter: () => false,
      text: () => Boolean(capabilities?.createResource),
      spreadsheet: () => Boolean(capabilities?.createResource),
      remote: () => Boolean(capabilities?.createResource),
      geographic: () => Boolean(capabilities?.createResource),
      event: () => Boolean(capabilities?.createResource),
      legalReference: () => Boolean(capabilities?.createResource),
      file: () => Boolean(capabilities?.uploadDocument || capabilities?.importSpreadsheet),
    });
  const creatable = attachmentKinds.filter(canCreate);
  const canAttach = Boolean(capabilities?.associateResource);
  if (!creatable.length && !canAttach) return null;

  const attach = async (resourceId: string) => {
    setOpen(false);
    try {
      if (await useCouncilBusinessStore.getState().associateResource(business.id, resourceId)) {
        onAttached?.(resourceId);
        return;
      }
      onError?.(useCouncilBusinessStore.getState().error ?? "request_failed");
    } catch (failure) {
      onError?.(apiErrorCode(failure));
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        {anchorPoint ? (
          <PopoverAnchor asChild>
            <span aria-hidden="true" className="fixed size-px" style={{ left: anchorPoint.x, top: anchorPoint.y }} />
          </PopoverAnchor>
        ) : (
          <PopoverTrigger asChild>
            <Button
              data-testid="attachment-picker-open"
              variant="ghost"
              size="icon-xs"
              aria-label={t("workspace.addResource")}
              title={t("workspace.addResource")}
              disabled={disabled}
              aria-expanded={open}
            >
              <AddIcon />
            </Button>
          </PopoverTrigger>
        )}
        {open ? (
          <PopoverContent
            className="attachment-picker-panel max-h-(--radix-popover-content-available-height) w-(--hall-size-resource-picker) p-(--hall-space-3)"
            align={anchorPoint ? "start" : "end"}
            side="bottom"
            collisionPadding={16}
            data-testid="attachment-picker-panel"
            aria-label={t("workspace.addResource")}
            onFocusOutside={anchorPoint ? (event) => event.preventDefault() : undefined}
          >
            {creatable.length ? (
              <section className="attachment-picker-section" data-testid="attachment-picker-create">
                <h3>{t("workspace.attachmentNew")}</h3>
                <div className="attachment-picker-kinds">
                  {creatable.map((kind) => {
                    const Icon = workspaceCreateKindIcons[kind];
                    return (
                      <Button
                        key={kind}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="attachment-picker-kind"
                        data-testid={`attachment-picker-create-${kind}`}
                        onClick={() => {
                          setOpen(false);
                          creation.start(kind);
                        }}
                      >
                        <Icon />
                        <span>{t(workspaceCreateLabels[kind])}</span>
                      </Button>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {canAttach ? (
              <section className="attachment-picker-section attachment-picker-existing">
                <h3>{t("workspace.attachmentExisting")}</h3>
                <ResourceSearch
                  testId="attachment-picker-search"
                  scope={{ types: ["resource"], excludedIds, context: business.folderPath }}
                  items={candidates.map((resource) => ({
                    ...resourceMentionable(resource, t),
                    preferred: resource.path === business.folderPath,
                  }))}
                  onPick={(item) => void attach(item.id)}
                  onClose={() => setOpen(false)}
                />
              </section>
            ) : null}
          </PopoverContent>
        ) : null}
      </Popover>
      {creation.dialog}
    </>
  );
}
