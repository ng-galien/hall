import type { ContentTemplate, HallSettings } from "@hall/domain";

export type SaveContentTemplate = Omit<ContentTemplate, "id" | "createdAt" | "updatedAt">;

export interface ContentTemplateRepository {
  list(): Promise<ContentTemplate[]>;
  find(id: string): Promise<ContentTemplate | null>;
  create(input: SaveContentTemplate): Promise<ContentTemplate>;
  update(id: string, input: SaveContentTemplate): Promise<ContentTemplate | null>;
  delete(id: string): Promise<boolean>;
}

export type UpdateHallSettings = Omit<HallSettings, "updatedAt">;

export interface HallSettingsRepository {
  get(): Promise<HallSettings>;
  update(input: UpdateHallSettings): Promise<HallSettings>;
}

export interface UnitOfWork {
  /** Executes the operation atomically. Repository-level conflict claims remain authoritative across connections. */
  execute<T>(operation: () => Promise<T>): Promise<T>;
}
