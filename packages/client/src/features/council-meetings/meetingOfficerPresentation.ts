import type { AuxiliaryAttendanceQuality, MeetingOffice, MeetingOfficerBasis } from "@hall/api-contract";
import type { TranslationKey } from "../../i18n/en";

const officerBasisLabels: Record<MeetingOfficerBasis, TranslationKey> = {
  mayor: "officers.basis.mayor",
  deputyInNominationOrder: "officers.basis.deputyInNominationOrder",
  councilDesignation: "officers.basis.councilDesignation",
  councilNomination: "officers.basis.councilNomination",
};

const officeLabels: Record<MeetingOffice, TranslationKey> = {
  chair: "officers.office.chair",
  secretary: "officers.office.secretary",
};

const qualityLabels: Record<AuxiliaryAttendanceQuality, TranslationKey> = {
  townHallSecretary: "auxiliary.quality.townHallSecretary",
  auxiliarySecretary: "auxiliary.quality.auxiliarySecretary",
  guest: "auxiliary.quality.guest",
  expert: "auxiliary.quality.expert",
};

export function officerBasisLabel(basis: MeetingOfficerBasis): TranslationKey {
  return officerBasisLabels[basis];
}

export function officeLabel(office: MeetingOffice): TranslationKey {
  return officeLabels[office];
}

export function auxiliaryQualityLabel(quality: AuxiliaryAttendanceQuality): TranslationKey {
  return qualityLabels[quality];
}
