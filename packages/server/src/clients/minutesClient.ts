import type { MinutesDetail, MinutesSummary, UpdateMinutesDraft } from "@hall/api-contract";

/** Dedicated minutes storage; generated documents never enter the workspace resource collection. */
export interface MinutesClient {
  list(): Promise<MinutesSummary[]>;
  open(id: string): Promise<MinutesDetail | null>;
  updateDraft(id: string, input: UpdateMinutesDraft): Promise<MinutesDetail>;
  generate(id: string, expectedVersion: number, content: Buffer): Promise<MinutesDetail>;
  content(id: string): Promise<Buffer | null>;
}
