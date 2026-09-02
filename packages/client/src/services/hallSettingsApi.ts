import { findSirenAction } from "@hall/api-contract";
import type { HallSettings } from "@hall/domain";
import { apiSirenRequest, submitSirenAction } from "./apiClient";

export async function loadHallSettings(): Promise<{ settings: HallSettings; canUpdate: boolean }> {
  const result = await apiSirenRequest<HallSettings>("/settings");
  return {
    settings: result.data,
    canUpdate: Boolean(result.representation && findSirenAction(result.representation, "settings.update")),
  };
}

export async function updateActiveCouncilTermExpectedMemberCount(expectedMemberCount: number): Promise<HallSettings> {
  const current = await apiSirenRequest<HallSettings>("/settings");
  if (!current.representation) throw new Error("Missing Hall settings Siren representation");
  const { updatedAt: _updatedAt, ...settings } = current.data;
  return (
    await submitSirenAction<HallSettings>(current.representation, "settings.update", {
      ...settings,
      councilTerm: { expectedMemberCount },
    })
  ).data;
}
