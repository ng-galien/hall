import { AsyncLocalStorage } from "node:async_hooks";
import type { ApiPrincipal } from "@hall/api-contract";
import type { AuditIntent } from "../api/apiCommandResolution.js";

export function inferAuditTargetId(intent: AuditIntent, result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  if ("id" in result && typeof result.id === "string") return result.id;
  if (intent.targetType === "workspace-folder" && "path" in result && typeof result.path === "string") {
    return result.path;
  }
  return null;
}

export interface RequestContext {
  requestId: string;
  liveOrigin?: string;
  principal?: ApiPrincipal;
  audit?: AuditIntent;
  auditRecorded?: boolean;
}

export class RequestContextStore {
  readonly #storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.#storage.run(context, callback);
  }

  current(): RequestContext | undefined {
    return this.#storage.getStore();
  }

  setPrincipal(principal: ApiPrincipal | undefined): void {
    const context = this.current();
    if (context) context.principal = principal;
  }

  setAudit(intent: AuditIntent): void {
    const context = this.current();
    if (context) context.audit = intent;
  }
}
