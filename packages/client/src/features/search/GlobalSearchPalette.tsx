import { matchDiscriminated } from "@hall/domain";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Mentionable } from "../../components/editor/references";
import { ResourceSearch } from "../../components/search/ResourceSearch";
import { useI18n } from "../../i18n/I18nProvider";
import { useContactsStore } from "../../stores/contactsStore";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { ResourcePreview } from "../documents/ResourcePreview";
import { referenceOpenTarget } from "../references/referenceNavigation";
/* The global palette (Ctrl+K or Cmd+K): search from anywhere just to go and look at something.
   Picking a resource opens its full preview in place; other entities navigate to their screen. */

export function GlobalSearchPalette() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [previewedResource, setPreviewedResource] = useState<string | null>(null);
  const { businesses } = useCouncilBusinessStore();
  const decisions = useCouncilDecisionsStore((store) => store.councilDecisions);
  const meetings = useCouncilMeetingsStore((store) => store.meetings);
  const members = useCouncilMembersStore((store) => store.members);
  const contacts = useContactsStore((store) => store.contacts);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setOpen(false);
  };

  const pick = (hit: Mentionable) => {
    const context = { resources: [], businesses, decisions, meetings, members, contacts };
    const target =
      hit.kind === "resource"
        ? { kind: "resourcePreview" as const, resourceId: hit.id }
        : referenceOpenTarget(hit.kind, hit.id, context);
    if (!target) return;
    matchDiscriminated(target, "kind", {
      resourcePreview: (entry) => {
        setPreviewedResource(entry.resourceId);
        setOpen(false);
      },
      route: (entry) => {
        close();
        navigate(entry.href);
      },
    });
  };

  return (
    <>
      {open ? (
        <Dialog open onOpenChange={(value) => !value && close()}>
          <DialogContent className="search-palette" closeLabel={t("common.close")} data-testid="search-palette">
            <DialogHeader>
              <DialogTitle>{t("search.palette.title")}</DialogTitle>
            </DialogHeader>
            <ResourceSearch testId="palette-search" onPick={pick} onClose={close} />
          </DialogContent>
        </Dialog>
      ) : null}
      {previewedResource ? (
        <ResourcePreview resourceId={previewedResource} onClose={() => setPreviewedResource(null)} />
      ) : null}
    </>
  );
}
