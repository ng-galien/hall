import { type CouncilTerm, councilTermSchema, findSirenAction } from "@hall/api-contract";
import { type HallSettings, updateHallSettingsSchema } from "@hall/domain";
import { apiSirenRequest, submitSirenAction } from "./apiClient";

export async function loadMeetingSettings() {
  const result = await apiSirenRequest<unknown>("/settings");
  const { meetingLocations, timeZone } = updateHallSettingsSchema.parse(result.data);
  return { meetingLocations, timeZone };
}

/** Reads the commune position recorded in HallSettings, or null when none is recorded. */
export async function loadCommunePosition() {
  const result = await apiSirenRequest<unknown>("/settings");
  return updateHallSettingsSchema.parse(result.data).geographicPosition;
}

export async function loadHallSettings(): Promise<{
  settings: HallSettings;
  canUpdate: boolean;
  councilTerm: CouncilTerm | null;
  canConfigureCouncilTerm: boolean;
}> {
  const [result, terms] = await Promise.all([
    apiSirenRequest<HallSettings>("/settings"),
    apiSirenRequest<unknown>("/council-terms"),
  ]);
  const councilTerms = councilTermSchema.array().parse(terms.data);
  return {
    settings: result.data,
    canUpdate: Boolean(result.representation && findSirenAction(result.representation, "settings.update")),
    councilTerm: councilTerms[0] ?? null,
    canConfigureCouncilTerm: Boolean(
      terms.representation && findSirenAction(terms.representation, "council-term.configure"),
    ),
  };
}

// @implements-requirement HALL-FR-LOC-040
export async function updateMeetingLocations(meetingLocations: string[]): Promise<HallSettings> {
  const current = await apiSirenRequest<HallSettings>("/settings");
  if (!current.representation) throw new Error("Missing HallSettings Siren representation");
  const input = updateHallSettingsSchema.parse({ ...current.data, meetingLocations });
  return (await submitSirenAction<HallSettings>(current.representation, "settings.update", input)).data;
}

export async function updateActiveCouncilTermExpectedMemberCount(expectedMemberCount: number): Promise<CouncilTerm> {
  const current = await apiSirenRequest<unknown>("/council-terms");
  if (!current.representation) throw new Error("Missing CouncilTerm Siren representation");
  return councilTermSchema.parse(
    (await submitSirenAction<unknown>(current.representation, "council-term.configure", { expectedMemberCount })).data,
  );
}

/** The municipality fields an administrator edits in Settings; the other settings keep their stored values. */
export type CommuneSettings = Pick<
  HallSettings,
  | "name"
  | "inseeCode"
  | "siren"
  | "addressLine1"
  | "addressLine2"
  | "postalCode"
  | "city"
  | "population"
  | "populationReferenceDate"
  | "phone"
  | "website"
  | "email"
  | "timeZone"
>;

// @implements-requirement HALL-FR-COM-010
export async function updateCommuneSettings(commune: CommuneSettings): Promise<HallSettings> {
  const current = await apiSirenRequest<HallSettings>("/settings");
  if (!current.representation) throw new Error("Missing HallSettings Siren representation");
  const input = updateHallSettingsSchema.parse({ ...current.data, ...commune });
  return (await submitSirenAction<HallSettings>(current.representation, "settings.update", input)).data;
}

export type MailSettingsValues = Pick<
  HallSettings,
  | "outboundEmailSenderName"
  | "outboundEmailSenderAddress"
  | "outboundEmailReplyToAddress"
  | "outboundEmailSignatureMarkdown"
  | "outboundEmailFooterMarkdown"
>;

export async function updateMailSettings(mail: MailSettingsValues): Promise<HallSettings> {
  const current = await apiSirenRequest<HallSettings>("/settings");
  if (!current.representation) throw new Error("Missing HallSettings Siren representation");
  const input = updateHallSettingsSchema.parse({ ...current.data, ...mail });
  return (await submitSirenAction<HallSettings>(current.representation, "settings.update", input)).data;
}
