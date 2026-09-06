import {
  type GenerateMinutes,
  generateMinutesSchema,
  minutesDetailSchema,
  minutesSummarySchema,
  type UpdateMinutesDraft,
  updateMinutesDraftSchema,
} from "@hall/api-contract";
import { apiRequest, apiSirenRequest, submitSirenActionAt } from "./apiClient";

export async function listMinutes() {
  return minutesSummarySchema.array().parse(await apiRequest<unknown>("/minutes"));
}

export async function openMinutes(id: string) {
  const result = await apiSirenRequest<unknown>(`/minutes/${encodeURIComponent(id)}`);
  return { ...result, data: minutesDetailSchema.parse(result.data) };
}

export async function updateMinutesDraft(id: string, input: UpdateMinutesDraft) {
  const result = await submitSirenActionAt<unknown>(
    `/minutes/${encodeURIComponent(id)}`,
    "minutes.update-draft",
    updateMinutesDraftSchema.parse(input),
  );
  return { ...result, data: minutesDetailSchema.parse(result.data) };
}

export async function generateMinutes(id: string, input: GenerateMinutes) {
  const result = await submitSirenActionAt<unknown>(
    `/minutes/${encodeURIComponent(id)}`,
    "minutes.generate",
    generateMinutesSchema.parse(input),
  );
  return { ...result, data: minutesDetailSchema.parse(result.data) };
}

export function minutesContentHref(id: string) {
  return `/api/minutes/${encodeURIComponent(id)}/content`;
}
