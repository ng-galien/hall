import type {
  AgendaItemPresidencyBasis,
  AuxiliaryAttendanceQuality,
  BallotChairBasis,
  MeetingOffice,
  MeetingOfficerBasis,
} from "@hall/api-contract";
import type { TranslationKey } from "../../i18n/en";

const ballotChairBasisLabels: Record<BallotChairBasis, TranslationKey> = {
  meetingChair: "ballot.chairBasis.meetingChair",
  statutoryReplacement: "ballot.chairBasis.statutoryReplacement",
  financialStatementElection: "ballot.chairBasis.financialStatementElection",
  councilDesignation: "ballot.chairBasis.councilDesignation",
};

const officerBasisLabels: Record<MeetingOfficerBasis, TranslationKey> = {
  mayor: "officers.basis.mayor",
  deputyInNominationOrder: "officers.basis.deputyInNominationOrder",
  councilDesignation: "officers.basis.councilDesignation",
  councilNomination: "officers.basis.councilNomination",
  financialStatementElection: "officers.basis.financialStatementElection",
};

const officeLabels: Record<MeetingOffice, TranslationKey> = {
  chair: "officers.office.chair",
  secretary: "officers.office.secretary",
};

const presidencyBasisLabels: Record<AgendaItemPresidencyBasis, TranslationKey> = {
  financialStatementElection: "presidency.financialStatementElection",
  councilDesignation: "presidency.councilDesignation",
};

const qualityLabels: Record<AuxiliaryAttendanceQuality, TranslationKey> = {
  townHallSecretary: "auxiliary.quality.townHallSecretary",
  auxiliarySecretary: "auxiliary.quality.auxiliarySecretary",
  guest: "auxiliary.quality.guest",
  expert: "auxiliary.quality.expert",
};

export function ballotChairBasisLabel(basis: BallotChairBasis): TranslationKey {
  return ballotChairBasisLabels[basis];
}

export function officerBasisLabel(basis: MeetingOfficerBasis): TranslationKey {
  return officerBasisLabels[basis];
}

export function officeLabel(office: MeetingOffice): TranslationKey {
  return officeLabels[office];
}

export function presidencyBasisLabel(basis: AgendaItemPresidencyBasis): TranslationKey {
  return presidencyBasisLabels[basis];
}

export function auxiliaryQualityLabel(quality: AuxiliaryAttendanceQuality): TranslationKey {
  return qualityLabels[quality];
}
