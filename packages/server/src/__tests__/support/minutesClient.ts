import { randomUUID } from "node:crypto";
import type { MinutesDetail } from "@hall/api-contract";
import type { MinutesClient } from "../../clients/minutesClient.js";
import { DomainError } from "../../services/errors.js";

export function createTestMinutesClient() {
  const entries = new Map<string, MinutesDetail>();
  const documents = new Map<string, Buffer>();
  function requireDraft(id: string, version: number) {
    const entry = entries.get(id);
    if (!entry || entry.generatedAt || entry.version !== version) throw new DomainError("minutes_conflict", 409);
    return entry;
  }
  const client: MinutesClient = {
    async list() {
      return [...entries.values()].map(({ sections: _sections, facts: _facts, ...summary }) => summary);
    },
    async open(id) {
      return entries.get(id) ?? null;
    },
    async updateDraft(id, input) {
      const entry = requireDraft(id, input.expectedVersion);
      if (!entry.sections.some((section) => section.agendaItemId === input.agendaItemId))
        throw new DomainError("minutes_conflict", 409);
      const updated = {
        ...entry,
        sections: entry.sections.map((section) =>
          section.agendaItemId === input.agendaItemId ? { ...section, content: input.content } : section,
        ),
        version: entry.version + 1,
        updatedAt: new Date().toISOString(),
      };
      entries.set(id, updated);
      return updated;
    },
    async generate(id, expectedVersion, content) {
      const entry = requireDraft(id, expectedVersion);
      const generatedAt = new Date().toISOString();
      const generated = {
        ...entry,
        version: entry.version + 1,
        updatedAt: generatedAt,
        generatedAt,
        documentId: randomUUID(),
      };
      entries.set(id, generated);
      documents.set(id, content);
      return generated;
    },
    async content(id) {
      return documents.get(id) ?? null;
    },
  };
  return { client, entries };
}
