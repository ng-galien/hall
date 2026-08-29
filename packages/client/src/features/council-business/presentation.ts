import type { CouncilBusiness, CouncilMatter } from "@hall/domain";
import type { TranslationKey } from "../../i18n/en";

export const councilBusinessKindKeys: Record<CouncilBusiness["kind"], TranslationKey> = {
  matter: "councilBusinessKind.matter",
  minutesApproval: "councilBusinessKind.minutesApproval",
  openQuestion: "councilBusinessKind.openQuestion",
};

export function isCouncilMatter(business: CouncilBusiness): business is CouncilMatter {
  return business.kind === "matter";
}

export function hasCouncilDecision(business: CouncilBusiness): business is CouncilMatter {
  return isCouncilMatter(business) && Boolean(business.councilDecisionId);
}
