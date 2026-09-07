import { type CouncilBusiness, matchLiteral } from "@hall/domain";
import type { TranslationKey } from "../../i18n/en";
import type { LiveMeetingBusiness } from "../../models/liveMeeting";

export function liveBusinessTitle(
  business: Pick<LiveMeetingBusiness, "kind" | "title">,
  minutesApprovalLabel: string,
): string {
  return matchLiteral(business.kind, {
    minutesApproval: () => minutesApprovalLabel,
    matter: () => business.title,
    businessConsultation: () => business.title,
    openQuestion: () => business.title,
  });
}

export const councilBusinessKindKeys: Record<CouncilBusiness["kind"], TranslationKey> = {
  matter: "councilBusinessKind.matter",
  minutesApproval: "councilBusinessKind.minutesApproval",
  openQuestion: "councilBusinessKind.openQuestion",
};
