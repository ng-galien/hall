import type { CouncilBusiness } from "@hall/domain";
import type { TranslationKey } from "../../i18n/en";

export const councilBusinessKindKeys: Record<CouncilBusiness["kind"], TranslationKey> = {
  matter: "councilBusinessKind.matter",
  minutesApproval: "councilBusinessKind.minutesApproval",
  openQuestion: "councilBusinessKind.openQuestion",
};
