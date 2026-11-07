import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileIcon } from "../../components/icons";
import { EntitySelect } from "../../components/search/EntitySelect";
import { Modal } from "../../components/Ui";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { DocumentObjectViewer } from "../documents/DocumentObjectViewer";

// @implements-requirement HALL-FR-ATT-170
// @implements-requirement HALL-FR-ATT-180
/** The attendance sheet and the proxy form of a meeting, generated on demand and shown in the document viewer. */
export function MeetingAttendanceDocuments({
  meetingLabel,
  attendanceSheetHref,
  proxyFormHref,
}: {
  meetingLabel: string;
  attendanceSheetHref: string | null;
  proxyFormHref: string | null;
}) {
  const { t } = useI18n();
  const { members } = useCouncilMembersStore();
  const fieldId = useId();
  const [viewer, setViewer] = useState<{ title: string; href: string } | null>(null);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [grantor, setGrantor] = useState("");
  const [holder, setHolder] = useState("");
  const options = members
    .filter((member) => member.active)
    .map((member) => ({ value: member.id, label: `${member.contact.firstName} ${member.contact.lastName}` }));

  const submitProxy = (event: FormEvent) => {
    event.preventDefault();
    if (!proxyFormHref || !grantor || grantor === holder) return;
    const query = new URLSearchParams({ grantorMemberId: grantor, ...(holder ? { holderMemberId: holder } : {}) });
    setProxyOpen(false);
    setViewer({ title: `${t("meeting.proxyForm")} · ${meetingLabel}`, href: `${proxyFormHref}?${query}` });
  };

  return (
    <>
      {attendanceSheetHref ? (
        <Button
          variant="outline"
          data-testid="meeting-attendance-sheet-open"
          onClick={() =>
            setViewer({ title: `${t("meeting.attendanceSheet")} · ${meetingLabel}`, href: attendanceSheetHref })
          }
        >
          <FileIcon aria-hidden="true" />
          {t("meeting.attendanceSheet")}
        </Button>
      ) : null}
      {proxyFormHref ? (
        <Button variant="outline" data-testid="meeting-proxy-form-open" onClick={() => setProxyOpen(true)}>
          <FileIcon aria-hidden="true" />
          {t("meeting.proxyFormOpen")}
        </Button>
      ) : null}
      <Modal open={proxyOpen} title={t("meeting.proxyForm")} onClose={() => setProxyOpen(false)}>
        <form className="modal-form" onSubmit={submitProxy}>
          <div className="form-grid">
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-grantor`}>{t("meeting.proxyFormGrantor")}</Label>
              <EntitySelect
                type="member"
                value={grantor}
                onValueChange={(value) => {
                  setGrantor(value);
                  if (value === holder) setHolder("");
                }}
                testId="meeting-proxy-grantor"
                placeholder={t("meeting.proxyFormGrantorPlaceholder")}
                options={options}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-holder`}>{t("meeting.proxyFormHolder")}</Label>
              <EntitySelect
                type="member"
                value={holder}
                onValueChange={setHolder}
                testId="meeting-proxy-holder"
                placeholder={t("meeting.proxyFormHolderPlaceholder")}
                options={options.filter((option) => option.value !== grantor)}
                clearLabel={t("meeting.proxyFormHolderClear")}
              />
            </div>
          </div>
          <Button
            className="justify-self-end"
            data-testid="meeting-proxy-form-submit"
            type="submit"
            disabled={!grantor || grantor === holder}
          >
            {t("meeting.proxyFormGenerate")}
          </Button>
        </form>
      </Modal>
      {viewer ? (
        <DocumentObjectViewer
          title={viewer.title}
          objectUrl={viewer.href}
          mediaType="application/pdf"
          onClose={() => setViewer(null)}
        />
      ) : null}
    </>
  );
}
