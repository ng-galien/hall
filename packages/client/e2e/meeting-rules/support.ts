import type { APIResponse, Page } from "@playwright/test";
import { expect } from "../captures/fixtures";

/** Read helpers of the meeting-rule journeys: they only read Hall's state, every rule gesture is made on screen. */

interface Entity<T> {
  properties: T;
}

export interface CouncilMember {
  id: string;
  role: "mayor" | "deputyMayor" | "councillor";
  active: boolean;
}

export async function properties<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.url()} ${await response.text()}`).toBeTruthy();
  return ((await response.json()) as Entity<T>).properties;
}

export async function items<T>(response: APIResponse): Promise<T[]> {
  expect(response.ok(), response.url()).toBeTruthy();
  return (((await response.json()) as { entities?: Entity<T>[] }).entities ?? []).map((entity) => entity.properties);
}

/** The active councillors without an office, in the order of the council. */
export async function councillors(page: Page): Promise<CouncilMember[]> {
  return (await items<CouncilMember>(await page.request.get("/api/council-members"))).filter(
    (member) => member.active && member.role === "councillor",
  );
}
