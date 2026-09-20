import { type CouncilTerm, councilTermSchema, findSirenAction } from "@hall/api-contract";
import { type HallSettings, updateHallSettingsSchema } from "@hall/domain";
import { apiSirenRequest, submitSirenAction } from "./apiClient";

export async function loadMeetingSettings() {
  const result = await apiSirenRequest<unknown>("/settings");
  const { meetingLocations, timeZone } = updateHallSettingsSchema.parse(result.data);
  return { meetingLocations, timeZone };
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

export async function updateActiveCouncilTermExpectedMemberCount(expectedMemberCount: number): Promise<CouncilTerm> {
  const current = await apiSirenRequest<unknown>("/council-terms");
  if (!current.representation) throw new Error("Missing CouncilTerm Siren representation");
  return councilTermSchema.parse(
    (await submitSirenAction<unknown>(current.representation, "council-term.configure", { expectedMemberCount })).data,
  );
}
