import { AsyncLocalStorage } from "node:async_hooks";
import type { ApiPrincipal } from "@hall/api-contract";

export interface AuditIntent {
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
}

export interface RequestContext {
  requestId: string;
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
