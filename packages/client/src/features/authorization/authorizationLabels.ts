import type { TranslationKey } from "../../i18n/en";

export const authorizationLabels: Record<string, { resource: TranslationKey; operation: TranslationKey }> = {
  read: { resource: "authorization.catalog.read.resource", operation: "authorization.catalog.read.operation" },
  export: { resource: "authorization.catalog.export.resource", operation: "authorization.catalog.export.operation" },
  session: { resource: "authorization.catalog.session.resource", operation: "authorization.catalog.session.operation" },
  installation: {
    resource: "authorization.catalog.installation.resource",
    operation: "authorization.catalog.installation.operation",
  },
  "contact.manage": {
    resource: "authorization.catalog.contact.manage.resource",
    operation: "authorization.catalog.contact.manage.operation",
  },
  "member.manage": {
    resource: "authorization.catalog.member.manage.resource",
    operation: "authorization.catalog.member.manage.operation",
  },
  "council-term.configure": {
    resource: "authorization.catalog.council-term.configure.resource",
    operation: "authorization.catalog.council-term.configure.operation",
  },
  "delegation.manage": {
    resource: "authorization.catalog.delegation.manage.resource",
    operation: "authorization.catalog.delegation.manage.operation",
  },
  "committee.manage": {
    resource: "authorization.catalog.committee.manage.resource",
    operation: "authorization.catalog.committee.manage.operation",
  },
  "council-business.write": {
    resource: "authorization.catalog.council-business.write.resource",
    operation: "authorization.catalog.council-business.write.operation",
  },
  "council-business.delete": {
    resource: "authorization.catalog.council-business.delete.resource",
    operation: "authorization.catalog.council-business.delete.operation",
  },
  "common-resource.write": {
    resource: "authorization.catalog.common-resource.write.resource",
    operation: "authorization.catalog.common-resource.write.operation",
  },
  "common-resource.delete": {
    resource: "authorization.catalog.common-resource.delete.resource",
    operation: "authorization.catalog.common-resource.delete.operation",
  },
  "personal-resource.write": {
    resource: "authorization.catalog.personal-resource.write.resource",
    operation: "authorization.catalog.personal-resource.write.operation",
  },
  "personal-resource.delete": {
    resource: "authorization.catalog.personal-resource.delete.resource",
    operation: "authorization.catalog.personal-resource.delete.operation",
  },
  "personal-workspace.manage": {
    resource: "authorization.catalog.personal-workspace.manage.resource",
    operation: "authorization.catalog.personal-workspace.manage.operation",
  },
  "template.write": {
    resource: "authorization.catalog.template.write.resource",
    operation: "authorization.catalog.template.write.operation",
  },
  "template.delete": {
    resource: "authorization.catalog.template.delete.resource",
    operation: "authorization.catalog.template.delete.operation",
  },
  "meeting.prepare": {
    resource: "authorization.catalog.meeting.prepare.resource",
    operation: "authorization.catalog.meeting.prepare.operation",
  },
  "agenda-item.prepare": {
    resource: "authorization.catalog.agenda-item.prepare.resource",
    operation: "authorization.catalog.agenda-item.prepare.operation",
  },
  "decision.draft": {
    resource: "authorization.catalog.decision.draft.resource",
    operation: "authorization.catalog.decision.draft.operation",
  },
  "minutes.draft": {
    resource: "authorization.catalog.minutes.draft.resource",
    operation: "authorization.catalog.minutes.draft.operation",
  },
  "meeting.conduct": {
    resource: "authorization.catalog.meeting.conduct.resource",
    operation: "authorization.catalog.meeting.conduct.operation",
  },
  "agenda-item.conduct": {
    resource: "authorization.catalog.agenda-item.conduct.resource",
    operation: "authorization.catalog.agenda-item.conduct.operation",
  },
  "ballot.record": {
    resource: "authorization.catalog.ballot.record.resource",
    operation: "authorization.catalog.ballot.record.operation",
  },
  "user.list": {
    resource: "authorization.catalog.user.list.resource",
    operation: "authorization.catalog.user.list.operation",
  },
  "user.manage": {
    resource: "authorization.catalog.user.manage.resource",
    operation: "authorization.catalog.user.manage.operation",
  },
  "settings.manage": {
    resource: "authorization.catalog.settings.manage.resource",
    operation: "authorization.catalog.settings.manage.operation",
  },
  "audit.read": {
    resource: "authorization.catalog.audit.read.resource",
    operation: "authorization.catalog.audit.read.operation",
  },
  "authorization.manage": {
    resource: "authorization.catalog.authorization.manage.resource",
    operation: "authorization.catalog.authorization.manage.operation",
  },
};
