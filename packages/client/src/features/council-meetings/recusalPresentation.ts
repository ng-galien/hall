import type { RecusalLegalBasis } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import type { TranslationKey } from "../../i18n/en";

const basisLabels: Record<RecusalLegalBasis, TranslationKey> = {
  personalInterest: "recusal.personalInterest",
  designatedRepresentativeConflict: "recusal.designatedRepresentativeConflict",
};

export function recusalBasisLabel(basis: RecusalLegalBasis): TranslationKey {
  return basisLabels[basis];
}

export function recusalBasisHint(basis: RecusalLegalBasis): TranslationKey {
  return matchLiteral(basis, {
    personalInterest: (): TranslationKey => "recusal.personalInterestHint",
    designatedRepresentativeConflict: (): TranslationKey => "recusal.designatedRepresentativeConflictHint",
  });
}
