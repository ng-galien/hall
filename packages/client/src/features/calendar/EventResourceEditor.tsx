import { eventDocumentSchema, findSirenAction, type ResourceDetail, type SirenEntity } from "@hall/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourceSaveStatus } from "../../pages/workspace/saveStatusStore";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { prepareEventInvitationMail } from "../../services/resourcesApi";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { EventFields } from "./EventFields";
import { eventDocumentUsesQuarterHours } from "./eventDates";

type EventResource = Extract<ResourceDetail, { kind: "event" }>;
// @implements-requirement HALL-FR-CAL-100
// @implements-requirement HALL-FR-CAL-110
// @implements-requirement HALL-FR-CAL-170
// @implements-requirement HALL-FR-CAL-180
// @implements-requirement HALL-FR-CAL-190
// @implements-requirement HALL-FR-CAL-200
// @implements-requirement HALL-FR-WSP-370 (the business of the appointment is known once the documents of every
// business, loaded on demand, are loaded)
export function EventResourceEditor({
  resource,
  representation,
  canUpdate,
  autosaveEnabled,
  onError,
  onRegisterFlush,
}: {
  resource: EventResource;
  representation: SirenEntity | null;
  canUpdate: boolean;
  autosaveEnabled: boolean;
  onError(error: ApiErrorCode | null): void;
  onRegisterFlush?(flush: (() => Promise<boolean>) | null): void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const associatedBusiness = businesses.find((business) =>
    business.resources.some((entry) => entry.id === resource.id),
  );
  const [councilBusinessId, setCouncilBusinessId] = useState<string | null>(associatedBusiness?.id ?? null);
  const businessIds = useCouncilBusinessStore((state) => state.businesses.map((business) => business.id).join(","));
  useEffect(() => {
    if (businessIds) void useCouncilBusinessStore.getState().loadResourceItems(businessIds.split(","));
  }, [businessIds]);
  const councilBusinessChosen = useRef(false);
  const associatedBusinessId = associatedBusiness?.id ?? null;
  useEffect(() => {
    if (!councilBusinessChosen.current) setCouncilBusinessId(associatedBusinessId);
  }, [associatedBusinessId]);
  const [draft, setDraft] = useState(resource.document);
  const latest = useRef(draft);
  const saved = useRef(JSON.stringify(resource.document));
  const version = useRef(resource.version);
  const pending = useRef<Promise<boolean> | null>(null);
  const councilBusinessPending = useRef<Promise<boolean> | null>(null);
  const [councilBusinessSaving, setCouncilBusinessSaving] = useState(false);
  const [generatingInvitation, setGeneratingInvitation] = useState(false);
  const { status, setStatus } = useResourceSaveStatus(resource.id);
  const valid = eventDocumentSchema.safeParse(draft).success && eventDocumentUsesQuarterHours(draft);
  const save = useCallback((): Promise<boolean> => {
    if (pending.current) return pending.current;
    const run = async () => {
      while (JSON.stringify(latest.current) !== saved.current) {
        if (
          !canUpdate ||
          !eventDocumentSchema.safeParse(latest.current).success ||
          !eventDocumentUsesQuarterHours(latest.current)
        )
          return false;
        const document = latest.current;
        setStatus("saving");
        const updated = await useWorkspaceResourcesStore
          .getState()
          .updateContent(resource.id, { kind: "event", expectedVersion: version.current, document });
        if (updated?.kind !== "event") {
          onError(useWorkspaceResourcesStore.getState().error);
          setStatus("error");
          return false;
        }
        version.current = updated.version;
        saved.current = JSON.stringify(document);
      }
      setStatus("saved");
      onError(null);
      return true;
    };
    pending.current = run().finally(() => {
      pending.current = null;
    });
    return pending.current;
  }, [canUpdate, onError, resource.id, setStatus]);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    onRegisterFlush?.(async () => {
      const associationSaved = await (councilBusinessPending.current ?? Promise.resolve(true));
      return associationSaved && saveRef.current();
    });
    return () => {
      onRegisterFlush?.(null);
      if (autosaveEnabled) void saveRef.current();
    };
  }, [onRegisterFlush, autosaveEnabled]);
  useEffect(() => {
    if (JSON.stringify(draft) === saved.current) return;
    setStatus("dirty");
    if (!autosaveEnabled || !valid) return;
    const timer = setTimeout(() => void saveRef.current(), 1000);
    return () => clearTimeout(timer);
  }, [draft, autosaveEnabled, valid, setStatus]);
  return (
    <div className="event-resource-editor" data-testid="event-resource-editor">
      <EventFields
        value={draft}
        councilBusinessId={councilBusinessId}
        councilBusinessPending={councilBusinessSaving}
        onCouncilBusinessChange={async (nextId) => {
          if (councilBusinessPending.current) return;
          const previousId = councilBusinessId;
          if (nextId === previousId) return;
          councilBusinessChosen.current = true;
          setCouncilBusinessId(nextId);
          setCouncilBusinessSaving(true);
          const run = async () => {
            const store = useCouncilBusinessStore.getState();
            const associated = nextId ? await store.associateResource(nextId, resource.id) : true;
            const dissociated =
              associated && previousId ? await store.dissociateResource(previousId, resource.id) : associated;
            if (associated && dissociated) {
              onError(null);
              return true;
            }
            if (associated && !dissociated && nextId) await store.dissociateResource(nextId, resource.id);
            setCouncilBusinessId(previousId);
            onError(store.error);
            return false;
          };
          councilBusinessPending.current = run().finally(() => {
            councilBusinessPending.current = null;
            setCouncilBusinessSaving(false);
          });
          await councilBusinessPending.current;
        }}
        readOnly={!canUpdate}
        onChange={(next) => {
          latest.current = next;
          setDraft(next);
        }}
      />
      {!valid && <p role="alert">{t("calendar.invalidDates")}</p>}
      {representation && findSirenAction(representation, "resource.generate-event-invitation") ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            data-testid="event-invitation-request"
            disabled={!valid || generatingInvitation || councilBusinessSaving || status === "saving"}
            onClick={async () => {
              setGeneratingInvitation(true);
              try {
                if (await save()) {
                  const message = await prepareEventInvitationMail(representation, "request");
                  navigate(`/mail/drafts/${message.id}`);
                }
              } catch (error) {
                onError(apiErrorCode(error));
              } finally {
                setGeneratingInvitation(false);
              }
            }}
          >
            {t("calendar.invitationRequest")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="event-invitation-cancel"
            disabled={!valid || generatingInvitation || councilBusinessSaving || status === "saving"}
            onClick={async () => {
              setGeneratingInvitation(true);
              try {
                if (await save()) {
                  const message = await prepareEventInvitationMail(representation, "cancel");
                  navigate(`/mail/drafts/${message.id}`);
                }
              } catch (error) {
                onError(apiErrorCode(error));
              } finally {
                setGeneratingInvitation(false);
              }
            }}
          >
            {t("calendar.invitationCancel")}
          </Button>
        </div>
      ) : null}
      {(status === "error" || !autosaveEnabled) && canUpdate && (
        <Button data-testid="event-retry-save" disabled={!valid || status === "saving"} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      )}
    </div>
  );
}
