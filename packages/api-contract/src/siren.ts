import { z } from "zod";

export const SIREN_MEDIA_TYPE = "application/vnd.siren+json" as const;

export const apiActionNames = [
  "session.bootstrap",
  "session.login",
  "session.change-password",
  "session.logout",
  "contact.create",
  "contact.update",
  "contact.archive",
  "member.create",
  "member.update",
  "council-term.configure",
  "delegation.create",
  "delegation.update",
  "delegation.archive",
  "delegation.add-membership",
  "delegation.update-membership",
  "delegation.end-membership",
  "committee.create",
  "committee.update",
  "committee.archive",
  "committee.add-membership",
  "committee.update-membership",
  "committee.end-membership",
  "decision.update-draft",
  "decision.freeze",
  "resource.create",
  "resource.relocate",
  "resource.update-metadata",
  "resource.update-content",
  "resource.generate-event-invitation",
  "resource.replace-document-content",
  "resource.import-spreadsheet",
  "resource.import-geographic-layer",
  "resource.link-geographic-layer",
  "resource.unlink-geographic-layer",
  "resource.create-geographic-feature-note",
  "resource.import-municipal-property",
  "resource.search-legal-references",
  "resource.resolve-legal-reference",
  "resource.refresh-legal-reference",
  "resource.create-document",
  "resource.create-editor-asset",
  "resource.delete",
  "council-business.create",
  "council-business.import-bundle",
  "council-business.delete",
  "council-business.associate-committee",
  "council-business.dissociate-committee",
  "council-business.export-bundle",
  "council-business.associate-resource",
  "council-business.dissociate-resource",
  "council-business.reorder-resources",
  "council-business.schedule-decision-proposal",
  "council-business.schedule-open-question",
  "meeting.provision-initial",
  "meeting.schedule",
  "meeting.prepare",
  "meeting.freeze-agenda",
  "meeting.reopen-agenda",
  "meeting.generate-notice-message",
  "meeting.generate-notice",
  "meeting.set-officers",
  "meeting.create-and-schedule-business",
  "meeting.record-opening",
  "meeting.add-open-question",
  "meeting.record-attendance-events",
  "meeting.record-quorum",
  "meeting.record-reconvocation",

  "meeting.close",
  // TODO REMOVE_STALE: temporary succession action.
  "meeting.mark-stale",
  "minutes.update-draft",
  "minutes.generate",
  "agenda-item.update-notes",
  "meeting.record-attendance",
  "meeting.reorder-agenda",
  "agenda-item.schedule",
  "agenda-item.schedule-prepared",
  "council-business.create-prepared-subject",
  "agenda-item.deprogram",
  "agenda-item.adjourn",
  "agenda-item.record-recusal",
  "agenda-item.reprogram",
  "agenda-item.start",
  "agenda-item.complete",
  "ballot.preview",
  "ballot.confirm",
  "user.create",
  "user.update",
  "user.reset-password",
  "user.disable",
  "user.assign-role",
  "settings.update",
  "template.create",
  "template.update",
  "template.delete",
  "template.preview",
  "template.preview-pdf",
  "template.generate",
] as const;
export type ApiActionName = (typeof apiActionNames)[number];
export const apiActionNameSchema = z.enum(apiActionNames);

export type SirenMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface SirenLink {
  rel: string[];
  href: string;
  class?: string[];
  title?: string;
  type?: string;
}

export interface SirenActionField {
  name: string;
  type?: string;
  value?: unknown;
  title?: string;
  accept?: string;
  options?: Array<{ value: string; title: string }>;
}

export interface SirenAction<TName extends string = ApiActionName> {
  name: TName;
  href: string;
  method?: SirenMethod;
  title?: string;
  type?: string;
  fields?: SirenActionField[];
}

export interface SirenEmbeddedLink {
  rel: string[];
  href: string;
  class?: string[];
  title?: string;
  type?: string;
}

export interface SirenEmbeddedEntity<TProperties extends object = Record<string, unknown>>
  extends SirenEntity<TProperties> {
  rel: string[];
}

export interface SirenEntity<TProperties extends object = Record<string, unknown>> {
  class?: string[];
  properties?: TProperties;
  entities?: Array<SirenEmbeddedEntity | SirenEmbeddedLink>;
  actions?: SirenAction[];
  links: SirenLink[];
  title?: string;
}

export const sirenLinkSchema = z.object({
  rel: z.array(z.string().min(1)).min(1),
  href: z.string().min(1),
  class: z.array(z.string().min(1)).optional(),
  title: z.string().optional(),
  type: z.string().optional(),
});

export const sirenActionSchema = z.object({
  name: apiActionNameSchema,
  href: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  title: z.string().optional(),
  type: z.string().optional(),
  fields: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        value: z.unknown().optional(),
        title: z.string().optional(),
        options: z.array(z.object({ value: z.string(), title: z.string() }).strict()).optional(),
      }),
    )
    .optional(),
});

export function sirenEntitySchema<TProperties extends z.ZodType>(properties: TProperties) {
  return z.object({
    class: z.array(z.string().min(1)).optional(),
    properties: properties.optional(),
    entities: z.array(z.unknown()).optional(),
    actions: z.array(sirenActionSchema).optional(),
    links: z.array(sirenLinkSchema).min(1),
    title: z.string().optional(),
  });
}

export function findSirenAction(entity: SirenEntity, name: ApiActionName): SirenAction | undefined {
  return entity.actions?.find((candidate) => candidate.name === name);
}

export function findSirenLink(entity: SirenEntity, rel: string): SirenLink | SirenEmbeddedLink | undefined {
  return (
    entity.links.find((candidate) => candidate.rel.includes(rel)) ??
    entity.entities?.find(
      (candidate): candidate is SirenEmbeddedLink => "href" in candidate && candidate.rel.includes(rel),
    )
  );
}

export function sirenData<T>(entity: SirenEntity<Record<string, unknown>>): T {
  if (entity.class?.some((name) => name.endsWith("-collection")) && Array.isArray(entity.entities)) {
    return entity.entities
      .filter((candidate): candidate is SirenEmbeddedEntity => "properties" in candidate)
      .map((candidate) => candidate.properties) as T;
  }
  if (Array.isArray(entity.properties?.items)) return entity.properties.items as T;
  return (entity.properties ?? entity) as T;
}
