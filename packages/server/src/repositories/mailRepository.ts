import type { PostgresClient, PostgresMail } from "@hall/postgres";
import { administrationCall, administrationRequest } from "../infrastructure/postgres/administrationRequest.js";
import type { RequestContextStore } from "../security/requestContext.js";

type Input<Name extends keyof PostgresMail> =
  Parameters<PostgresMail[Name]> extends [unknown, ...infer Rest] ? Rest : never;
export function createMailRepository({
  postgresClient,
  requestContext,
}: {
  postgresClient: PostgresClient;
  requestContext: RequestContextStore;
}) {
  const store = postgresClient.mail;
  const request = () => administrationRequest(requestContext);
  return {
    snapshot: (...args: Input<"snapshot">) => administrationCall(() => store.snapshot(request(), ...args)),
    snapshotAttachment: (...args: Input<"snapshotAttachment">) =>
      administrationCall(() => store.snapshotAttachment(request(), ...args)),
    list: () => administrationCall(() => store.list(request())),
    open: (...args: Input<"open">) => administrationCall(() => store.open(request(), ...args)),
    create: (...args: Input<"create">) => administrationCall(() => store.create(request(), ...args)),
    update: (...args: Input<"update">) => administrationCall(() => store.update(request(), ...args)),
    delete: (...args: Input<"delete">) => administrationCall(() => store.delete(request(), ...args)),
    attach: (...args: Input<"attach">) => administrationCall(() => store.attach(request(), ...args)),
    removeAttachment: (...args: Input<"removeAttachment">) =>
      administrationCall(() => store.removeAttachment(request(), ...args)),
    attachment: (...args: Input<"attachment">) => administrationCall(() => store.attachment(request(), ...args)),
    claimSubmission: (...args: Input<"claimSubmission">) =>
      administrationCall(() => store.claimSubmission(request(), ...args)),
    finish: (...args: Input<"finish">) => administrationCall(() => store.finish(request(), ...args)),
    verify: (...args: Input<"verify">) => administrationCall(() => store.verify(request(), ...args)),
    groups: () => administrationCall(() => store.groups(request())),
    saveGroup: (...args: Input<"saveGroup">) => administrationCall(() => store.saveGroup(request(), ...args)),
    deleteGroup: (...args: Input<"deleteGroup">) => administrationCall(() => store.deleteGroup(request(), ...args)),
  };
}
export type MailRepository = ReturnType<typeof createMailRepository>;
